import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  buildDevMatchCardManifestFromPoneglyphIds,
  createRedisCardDataCache,
  type DevPoneglyphFetch,
} from "@optcg/cards";
import type { CardId, PlayerId, VariantKey } from "@optcg/types";

import {
  decodeDeckHashSubmission,
  type DeckSubmission,
  type ReadyDeckSubmission,
} from "./deck-submission.js";
import type { DevMatchPlayerSetup, DevMatchSetup } from "./local-match.js";

interface CreateDefaultDevMatchSetupInput {
  readonly matchId: DevMatchSetup["matchId"];
  readonly firstPlayerId: PlayerId;
  readonly playerOrder: readonly [PlayerId, PlayerId];
  readonly createdAt: string;
  readonly fetchCard?: DevPoneglyphFetch;
  readonly baseUrl?: string;
  readonly redisUrl?: string;
}

export interface DevDonCounts {
  readonly firstPlayer: number;
  readonly secondPlayer: number;
}

export interface DevDeckCardEntry {
  readonly cardId: CardId;
  readonly count: number;
  readonly variantIndex?: number;
}

export interface DevDecklist {
  readonly leader: DevDeckCardEntry;
  readonly deckEntries: readonly DevDeckCardEntry[];
  readonly donDeckCount: number;
}

interface DevManifestForDeckSubmission {
  readonly cards: Partial<
    Record<
      CardId,
      {
        readonly category?: string;
        readonly life?: number;
        readonly variants?: readonly {
          readonly variantIndex: number;
          readonly variantKey?: VariantKey;
        }[];
      }
    >
  >;
}

export const createDevDeckCardIds = (
  entries: readonly DevDeckCardEntry[],
): CardId[] =>
  entries.flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.cardId),
  );

export const createDevDeckVariantIndexes = (
  entries: readonly DevDeckCardEntry[],
): Array<number | undefined> =>
  entries.flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.variantIndex),
  );

export const createDevManifestCardIds = (
  ...decklists: readonly DevDecklist[]
): CardId[] => {
  const cardIds = decklists.flatMap((decklist) => [
    decklist.leader.cardId,
    ...decklist.deckEntries.map((entry) => entry.cardId),
  ]);
  return [...new Set(cardIds)];
};

export const createDevDecklistFromSubmission = (
  submission: DeckSubmission,
): DevDecklist => {
  if (submission.status !== "ready") {
    throw new TypeError("Dev match setup requires a ready deck submission.");
  }
  return {
    leader: submission.decoded.leader,
    deckEntries: submission.decoded.main,
    donDeckCount: submission.donDeckCount,
  };
};

export const createDevDonDeckCardIds = (count: number): CardId[] =>
  Array.from(
    { length: count },
    (_, index) => `dev-don-${String(index + 1)}` as CardId,
  );

export const defaultDevDonCounts: DevDonCounts = {
  firstPlayer: 6,
  secondPlayer: 10,
};

export const defaultDevEffectDefinitionsVersion = "generated-dev-v3";

const assertValidDevDonCount = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
};

export const resolveDevDonCounts = (
  input: DevDonCounts,
): readonly [number, number] => [
  assertValidDevDonCount(input.firstPlayer, "deck1 DON deck count"),
  assertValidDevDonCount(input.secondPlayer, "deck2 DON deck count"),
];

export const createDevRngSeed = (): string => `dev-local-${randomUUID()}`;

export const createDevPlayerSetupFromDecklist = (
  playerId: PlayerId,
  decklist: DevDecklist,
  manifest: DevManifestForDeckSubmission,
  donDeckCardIds: CardId[],
): DevMatchPlayerSetup => {
  const leader = manifest.cards[decklist.leader.cardId];
  if (leader?.category !== "leader") {
    throw new Error(
      `Dev decklist leader ${String(decklist.leader.cardId)} must resolve to a Leader card.`,
    );
  }
  const leaderLife = leader.life;
  if (
    typeof leaderLife !== "number" ||
    !Number.isInteger(leaderLife) ||
    leaderLife < 0
  ) {
    throw new Error(
      `Dev decklist leader ${String(decklist.leader.cardId)} must have a life count.`,
    );
  }
  return {
    playerId,
    leaderCardId: decklist.leader.cardId,
    leaderLifeCount: leaderLife,
    ...(decklist.leader.variantIndex === undefined
      ? {}
      : { leaderVariantIndex: decklist.leader.variantIndex }),
    deckCardIds: createDevDeckCardIds(decklist.deckEntries),
    deckVariantIndexes: createDevDeckVariantIndexes(decklist.deckEntries),
    donDeckCardIds,
  };
};

export const validateDevDeckSubmissionVariants = (
  decklist: DevDecklist,
  manifest: DevManifestForDeckSubmission,
): void => {
  for (const entry of [decklist.leader, ...decklist.deckEntries]) {
    if (entry.variantIndex === undefined) {
      continue;
    }
    const variants = manifest.cards[entry.cardId]?.variants ?? [];
    if (
      !variants.some((variant) => variant.variantIndex === entry.variantIndex)
    ) {
      throw new TypeError(
        `Deck hash requested variant ${String(entry.variantIndex)} is not available for ${String(entry.cardId)}.`,
      );
    }
  }
};

const readDefaultDevDeckSubmission = async (
  fileName: "deck1.hash" | "deck2.hash",
  donDeckCount: number,
): Promise<ReadyDeckSubmission> => {
  const hash = (
    await readFile(new URL(`../dev-decks/${fileName}`, import.meta.url), "utf8")
  ).trim();
  const submission = await decodeDeckHashSubmission({ hash, donDeckCount });
  if (submission.status !== "ready") {
    throw new Error(`Invalid ${fileName}: ${submission.error}`);
  }
  return submission;
};

export const createDefaultDevMatchSetup = async (
  input: CreateDefaultDevMatchSetupInput,
): Promise<DevMatchSetup> => {
  const [firstPlayerDonCount, secondPlayerDonCount] =
    resolveDevDonCounts(defaultDevDonCounts);
  const firstPlayerDecklist = createDevDecklistFromSubmission(
    await readDefaultDevDeckSubmission("deck1.hash", firstPlayerDonCount),
  );
  const secondPlayerDecklist = createDevDecklistFromSubmission(
    await readDefaultDevDeckSubmission("deck2.hash", secondPlayerDonCount),
  );
  const firstPlayerDonDeck = createDevDonDeckCardIds(firstPlayerDonCount);
  const secondPlayerDonDeck = createDevDonDeckCardIds(secondPlayerDonCount);
  const devDonCount = Math.max(firstPlayerDonCount, secondPlayerDonCount);
  const cache =
    input.fetchCard === undefined
      ? await createRedisCardDataCache({
          url: input.redisUrl ?? process.env["REDIS_URL"] ?? defaultRedisUrl,
        })
      : undefined;
  const cardManifest = await buildDevMatchCardManifestFromPoneglyphIds({
    cardIds: createDevManifestCardIds(
      firstPlayerDecklist,
      secondPlayerDecklist,
    ),
    createdAt: input.createdAt,
    devDonCount,
    versions: {
      cardDataVersion: "live-poneglyph-dev-v1",
      effectDefinitionsVersion: defaultDevEffectDefinitionsVersion,
    },
    ...(cache === undefined ? {} : { cache }),
    ...(input.fetchCard === undefined ? {} : { fetchCard: input.fetchCard }),
    ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
  });
  validateDevDeckSubmissionVariants(firstPlayerDecklist, cardManifest);
  validateDevDeckSubmissionVariants(secondPlayerDecklist, cardManifest);
  return {
    matchId: input.matchId,
    firstPlayerId: input.firstPlayerId,
    rngSeed: createDevRngSeed(),
    playerOrder: input.playerOrder,
    players: [
      createDevPlayerSetupFromDecklist(
        input.playerOrder[0],
        firstPlayerDecklist,
        cardManifest,
        firstPlayerDonDeck,
      ),
      createDevPlayerSetupFromDecklist(
        input.playerOrder[1],
        secondPlayerDecklist,
        cardManifest,
        secondPlayerDonDeck,
      ),
    ],
    cardManifest,
    shuffleDecks: true,
  };
};

const defaultRedisUrl = "redis://localhost:6379";
