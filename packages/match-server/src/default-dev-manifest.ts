import { randomUUID } from "node:crypto";
import {
  createRedisCardDataCache,
  fetchDevPoneglyphCatalogSnapshot,
} from "@optcg/cards";
import {
  buildDevMatchCardManifestFromPoneglyphIds,
  type DevPoneglyphFetch,
} from "@optcg/card-support";
import type { CardId, PlayerId, VariantKey } from "@optcg/types";

import {
  type DeckSubmission,
  type ReadyDeckSubmission,
} from "./deck-submission.js";
import {
  validateDeckLoadout,
  type ExplicitDonDeckSubmission,
} from "./deck-validation.js";
import type { DevMatchPlayerSetup, DevMatchSetup } from "./local-match.js";
import { resolveRedisConfig, type RedisMode } from "./redis-config.js";

interface CreateDefaultDevMatchSetupInput {
  readonly matchId: DevMatchSetup["matchId"];
  readonly firstPlayerId: PlayerId;
  readonly playerOrder: readonly [PlayerId, PlayerId];
  readonly createdAt: string;
  readonly formatId?: string;
  readonly lobbyId?: string;
  readonly fetchCard?: DevPoneglyphFetch;
  readonly baseUrl?: string;
  readonly redisUrl?: string;
  readonly redisMode?: RedisMode;
}

export interface CreateDevMatchSetupFromDeckSubmissionsInput extends CreateDefaultDevMatchSetupInput {
  readonly firstPlayer: ReadyDeckSubmission;
  readonly secondPlayer: ReadyDeckSubmission;
}

export interface ValidateReadyDevDeckSubmissionInput extends Omit<
  CreateDefaultDevMatchSetupInput,
  "matchId" | "firstPlayerId" | "playerOrder"
> {
  readonly submission: ReadyDeckSubmission;
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
  firstPlayer: 10,
  secondPlayer: 10,
};

export const defaultDevEffectDefinitionsVersion = "generated-dev-v8";
const defaultDevDeckValidatorVersion = "dev-deck-validator-v3";
export const defaultDevDeckFormatId = "sandbox-open";

const defaultDevLeader: DevDeckCardEntry = {
  cardId: "OP13-079" as CardId,
  count: 1,
};

const defaultDevMainDeckEntries: readonly DevDeckCardEntry[] = [
  { cardId: "OP13-080" as CardId, count: 7 },
  { cardId: "OP13-082" as CardId, count: 7 },
  { cardId: "OP13-083" as CardId, count: 6 },
  { cardId: "OP13-084" as CardId, count: 6 },
  { cardId: "OP13-086" as CardId, count: 6 },
  { cardId: "OP13-089" as CardId, count: 6 },
  { cardId: "OP13-091" as CardId, count: 6 },
  { cardId: "OP13-099" as CardId, count: 6 },
];

const createDefaultDevDecklist = (donDeckCount: number): DevDecklist => ({
  leader: defaultDevLeader,
  deckEntries: defaultDevMainDeckEntries,
  donDeckCount,
});

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

const createExplicitDevDonDeckSubmission = (
  count: number,
): ExplicitDonDeckSubmission => ({
  source: "explicit",
  entries: createDevDonDeckCardIds(count).map((cardId) => ({
    cardId,
    count: 1,
  })),
});

export const validateAndAdaptDevDecklist = async ({
  decklist,
  cardManifest,
  formatId = defaultDevDeckFormatId,
  validationCache,
}: {
  readonly decklist: DevDecklist;
  readonly cardManifest: Awaited<
    ReturnType<typeof buildDevMatchCardManifestFromPoneglyphIds>
  >;
  readonly formatId?: string;
  readonly validationCache?: Awaited<
    ReturnType<typeof createRedisCardDataCache>
  >;
}): Promise<DevDecklist> => {
  const validation = await validateDeckLoadout({
    formatId,
    mainDeck: {
      source: "deckHash",
      hash: "dev-decklist",
      status: "ready",
      decoded: {
        leader: decklist.leader,
        main: decklist.deckEntries,
      },
      donDeckCount: decklist.donDeckCount,
    },
    donDeck: createExplicitDevDonDeckSubmission(decklist.donDeckCount),
    cards: cardManifest.cards,
    versions: {
      validatorVersion: defaultDevDeckValidatorVersion,
      cardDataVersion: cardManifest.cardDataVersion,
      effectDefinitionsVersion: cardManifest.effectDefinitionsVersion,
      overlayVersion: "dev-overlay-v1",
      banlistVersion: cardManifest.banlistVersion,
      rulesVersion: "dev-rules-v1",
    },
    ...(validationCache === undefined ? {} : { cache: validationCache }),
  });
  if (!validation.valid) {
    throw new Error(
      `Dev decklist failed validation: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }
  return {
    ...decklist,
    donDeckCount: validation.matchDonDeck.cards.length,
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

export const validateReadyDevDeckSubmission = async (
  input: ValidateReadyDevDeckSubmissionInput,
): Promise<void> => {
  const decklist = createDevDecklistFromSubmission(input.submission);
  const cardManifest = await buildDevManifestFromCardIds(
    createDevManifestCardIds(decklist),
    {
      matchId: "validation-only" as DevMatchSetup["matchId"],
      firstPlayerId: "p1" as PlayerId,
      playerOrder: ["p1" as PlayerId, "p2" as PlayerId],
      createdAt: input.createdAt,
      ...(input.fetchCard === undefined ? {} : { fetchCard: input.fetchCard }),
      ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
      ...(input.redisUrl === undefined ? {} : { redisUrl: input.redisUrl }),
      ...(input.redisMode === undefined ? {} : { redisMode: input.redisMode }),
    },
    decklist.donDeckCount,
  );
  const redisConfig = resolveRedisConfig({
    redisUrl: input.redisUrl,
    redisMode: input.redisMode,
  });
  const validationCache =
    input.fetchCard === undefined && redisConfig.redisUrl !== undefined
      ? await createRedisCardDataCache({
          url: redisConfig.redisUrl,
        })
      : undefined;
  validateDevDeckSubmissionVariants(decklist, cardManifest);
  const adaptedDecklist = await validateAndAdaptDevDecklist({
    decklist,
    cardManifest,
    ...(input.formatId === undefined ? {} : { formatId: input.formatId }),
    ...(validationCache === undefined ? {} : { validationCache }),
  });
  createDevPlayerSetupFromDecklist(
    "p1" as PlayerId,
    adaptedDecklist,
    cardManifest,
    createDevDonDeckCardIds(adaptedDecklist.donDeckCount),
  );
};

const buildDevManifestFromCardIds = async (
  cardIds: readonly CardId[],
  input: CreateDefaultDevMatchSetupInput,
  devDonCount: number,
) => {
  const redisConfig = resolveRedisConfig({
    redisUrl: input.redisUrl,
    redisMode: input.redisMode,
  });
  const cache =
    input.fetchCard === undefined && redisConfig.redisUrl !== undefined
      ? await createRedisCardDataCache({
          url: redisConfig.redisUrl,
        })
      : undefined;
  const versions =
    input.fetchCard === undefined
      ? (
          await fetchDevPoneglyphCatalogSnapshot({
            ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
            versions: {
              effectDefinitionsVersion: defaultDevEffectDefinitionsVersion,
            },
          })
        ).versions
      : {
          cardDataVersion: "live-poneglyph-dev-v1",
          effectDefinitionsVersion: defaultDevEffectDefinitionsVersion,
        };
  return await buildDevMatchCardManifestFromPoneglyphIds({
    cardIds,
    createdAt: input.createdAt,
    devDonCount,
    versions,
    ...(cache === undefined ? {} : { cache }),
    ...(input.fetchCard === undefined ? {} : { fetchCard: input.fetchCard }),
    ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
  });
};

const createDevMatchSetupFromDecklists = ({
  input,
  firstPlayerDecklist,
  secondPlayerDecklist,
  cardManifest,
}: {
  readonly input: CreateDefaultDevMatchSetupInput;
  readonly firstPlayerDecklist: DevDecklist;
  readonly secondPlayerDecklist: DevDecklist;
  readonly cardManifest: Awaited<
    ReturnType<typeof buildDevMatchCardManifestFromPoneglyphIds>
  >;
}): DevMatchSetup => {
  const firstPlayerDonDeck = createDevDonDeckCardIds(
    firstPlayerDecklist.donDeckCount,
  );
  const secondPlayerDonDeck = createDevDonDeckCardIds(
    secondPlayerDecklist.donDeckCount,
  );
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
    ...(input.lobbyId === undefined ? {} : { lobbyId: input.lobbyId }),
    shuffleDecks: true,
  };
};

export const createDevMatchSetupFromDeckSubmissions = async (
  input: CreateDevMatchSetupFromDeckSubmissionsInput,
): Promise<DevMatchSetup> => {
  return await createValidatedDevMatchSetupFromDecklists({
    input,
    firstPlayerDecklist: createDevDecklistFromSubmission(input.firstPlayer),
    secondPlayerDecklist: createDevDecklistFromSubmission(input.secondPlayer),
  });
};

const createValidatedDevMatchSetupFromDecklists = async ({
  input,
  firstPlayerDecklist,
  secondPlayerDecklist,
}: {
  readonly input: CreateDefaultDevMatchSetupInput;
  readonly firstPlayerDecklist: DevDecklist;
  readonly secondPlayerDecklist: DevDecklist;
}): Promise<DevMatchSetup> => {
  const devDonCount = Math.max(
    firstPlayerDecklist.donDeckCount,
    secondPlayerDecklist.donDeckCount,
  );
  const cardManifest = await buildDevManifestFromCardIds(
    createDevManifestCardIds(firstPlayerDecklist, secondPlayerDecklist),
    input,
    devDonCount,
  );
  const redisConfig = resolveRedisConfig({
    redisUrl: input.redisUrl,
    redisMode: input.redisMode,
  });
  const validationCache =
    input.fetchCard === undefined && redisConfig.redisUrl !== undefined
      ? await createRedisCardDataCache({
          url: redisConfig.redisUrl,
        })
      : undefined;
  validateDevDeckSubmissionVariants(firstPlayerDecklist, cardManifest);
  validateDevDeckSubmissionVariants(secondPlayerDecklist, cardManifest);
  const adaptedFirstPlayerDecklist = await validateAndAdaptDevDecklist({
    decklist: firstPlayerDecklist,
    cardManifest,
    ...(input.formatId === undefined ? {} : { formatId: input.formatId }),
    ...(validationCache === undefined ? {} : { validationCache }),
  });
  const adaptedSecondPlayerDecklist = await validateAndAdaptDevDecklist({
    decklist: secondPlayerDecklist,
    cardManifest,
    ...(input.formatId === undefined ? {} : { formatId: input.formatId }),
    ...(validationCache === undefined ? {} : { validationCache }),
  });
  return createDevMatchSetupFromDecklists({
    input,
    firstPlayerDecklist: adaptedFirstPlayerDecklist,
    secondPlayerDecklist: adaptedSecondPlayerDecklist,
    cardManifest,
  });
};

export const createDefaultDevMatchSetup = async (
  input: CreateDefaultDevMatchSetupInput,
): Promise<DevMatchSetup> => {
  const [firstPlayerDonCount, secondPlayerDonCount] =
    resolveDevDonCounts(defaultDevDonCounts);
  return await createValidatedDevMatchSetupFromDecklists({
    input,
    firstPlayerDecklist: createDefaultDevDecklist(firstPlayerDonCount),
    secondPlayerDecklist: createDefaultDevDecklist(secondPlayerDonCount),
  });
};
