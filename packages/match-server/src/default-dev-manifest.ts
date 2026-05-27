import { readFile } from "node:fs/promises";
import {
  buildDevMatchCardManifestFromPoneglyphIds,
  createRedisCardDataCache,
  type DevPoneglyphFetch,
} from "@optcg/cards";
import type { CardId, PlayerId } from "@optcg/types";

import type { DevMatchPlayerSetup, DevMatchSetup } from "./local-match.js";

interface CreateDefaultDevMatchSetupInput {
  readonly matchId: DevMatchSetup["matchId"];
  readonly firstPlayerId: PlayerId;
  readonly playerOrder: readonly [PlayerId, PlayerId];
  readonly createdAt: string;
  readonly devDonCounts?: DevDonCountOverrides;
  readonly fetchCard?: DevPoneglyphFetch;
  readonly baseUrl?: string;
  readonly redisUrl?: string;
}

export interface DevDonCountOverrides {
  readonly firstPlayer?: number;
  readonly secondPlayer?: number;
}

interface ResolveDevDonCountsInput {
  readonly devDonCounts?: DevDonCountOverrides;
  readonly env: Partial<Record<string, string | undefined>>;
}

export interface DevDeckCardEntry {
  readonly cardId: CardId;
  readonly count: number;
}

export interface DevDecklist {
  readonly leaderCardId: CardId;
  readonly deckEntries: readonly DevDeckCardEntry[];
}

interface DevLeaderManifest {
  readonly cards: Partial<
    Record<
      CardId,
      {
        readonly category?: string;
        readonly life?: number;
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

export const createDevManifestCardIds = (
  ...decklists: readonly DevDecklist[]
): CardId[] => {
  const cardIds = decklists.flatMap((decklist) => [
    decklist.leaderCardId,
    ...decklist.deckEntries.map((entry) => entry.cardId),
  ]);
  return [...new Set(cardIds)];
};

const decklistLinePattern = /^(?<count>[1-9]\d*)x(?<cardId>[A-Z0-9-]+)$/u;

export const parseDevDecklistText = (text: string): DevDecklist => {
  const lines = text
    .split(/\r?\n/u)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter((entry) => entry.line.length > 0);
  const first = lines[0];
  if (first === undefined) {
    throw new Error("Dev decklist must include a leader line.");
  }
  const entries = lines.map(({ line, lineNumber }) => {
    const match = decklistLinePattern.exec(line);
    if (match?.groups === undefined) {
      throw new Error(
        `invalid dev decklist line ${String(lineNumber)}: ${line}`,
      );
    }
    return {
      cardId: match.groups["cardId"] as CardId,
      count: Number.parseInt(match.groups["count"] ?? "", 10),
      lineNumber,
    };
  });
  const leader = entries[0];
  if (leader === undefined || leader.count !== 1) {
    throw new Error("Dev decklist first line must be the leader as 1xCARDID.");
  }
  return {
    leaderCardId: leader.cardId,
    deckEntries: entries.slice(1).map((entry) => ({
      cardId: entry.cardId,
      count: entry.count,
    })),
  };
};

export const createDevDonDeckCardIds = (count: number): CardId[] =>
  Array.from(
    { length: count },
    (_, index) => `dev-don-${String(index + 1)}` as CardId,
  );

const defaultDevDonCount = 10;

const assertValidDevDonCount = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
};

const resolveDevDonCount = (params: {
  readonly override: number | undefined;
  readonly envValue: string | undefined;
  readonly label: string;
}): number => {
  if (params.override !== undefined) {
    return assertValidDevDonCount(params.override, params.label);
  }
  if (params.envValue === undefined || params.envValue.length === 0) {
    return defaultDevDonCount;
  }
  if (!/^[1-9]\d*$/u.test(params.envValue)) {
    throw new Error(`${params.label} must be a positive integer.`);
  }
  return assertValidDevDonCount(
    Number.parseInt(params.envValue, 10),
    params.label,
  );
};

export const resolveDevDonCounts = (
  input: ResolveDevDonCountsInput,
): readonly [number, number] => [
  resolveDevDonCount({
    override: input.devDonCounts?.firstPlayer,
    envValue: input.env["DEV_DECK1_DON_DECK_COUNT"],
    label: "DEV_DECK1_DON_DECK_COUNT",
  }),
  resolveDevDonCount({
    override: input.devDonCounts?.secondPlayer,
    envValue: input.env["DEV_DECK2_DON_DECK_COUNT"],
    label: "DEV_DECK2_DON_DECK_COUNT",
  }),
];

export const createDevPlayerSetupFromDecklist = (
  playerId: PlayerId,
  decklist: DevDecklist,
  manifest: DevLeaderManifest,
  donDeckCardIds: CardId[],
): DevMatchPlayerSetup => {
  const leader = manifest.cards[decklist.leaderCardId];
  if (leader?.category !== "leader") {
    throw new Error(
      `Dev decklist leader ${String(decklist.leaderCardId)} must resolve to a Leader card.`,
    );
  }
  const leaderLife = leader.life;
  if (
    typeof leaderLife !== "number" ||
    !Number.isInteger(leaderLife) ||
    leaderLife < 0
  ) {
    throw new Error(
      `Dev decklist leader ${String(decklist.leaderCardId)} must have a life count.`,
    );
  }
  return {
    playerId,
    leaderCardId: decklist.leaderCardId,
    leaderLifeCount: leaderLife,
    deckCardIds: createDevDeckCardIds(decklist.deckEntries),
    donDeckCardIds,
  };
};

const readDefaultDevDecklist = async (fileName: "deck1.txt" | "deck2.txt") =>
  parseDevDecklistText(
    await readFile(
      new URL(`../dev-decks/${fileName}`, import.meta.url),
      "utf8",
    ),
  );

export const createDefaultDevMatchSetup = async (
  input: CreateDefaultDevMatchSetupInput,
): Promise<DevMatchSetup> => {
  const firstPlayerDecklist = await readDefaultDevDecklist("deck1.txt");
  const secondPlayerDecklist = await readDefaultDevDecklist("deck2.txt");
  const [firstPlayerDonCount, secondPlayerDonCount] = resolveDevDonCounts({
    ...(input.devDonCounts === undefined
      ? {}
      : { devDonCounts: input.devDonCounts }),
    env: process.env,
  });
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
      effectDefinitionsVersion: "generated-dev-v2",
    },
    ...(cache === undefined ? {} : { cache }),
    ...(input.fetchCard === undefined ? {} : { fetchCard: input.fetchCard }),
    ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
  });
  return {
    matchId: input.matchId,
    firstPlayerId: input.firstPlayerId,
    rngSeed: "op13-dev-local-seed",
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
