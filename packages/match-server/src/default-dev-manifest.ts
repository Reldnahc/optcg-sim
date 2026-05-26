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
  readonly fetchCard?: DevPoneglyphFetch;
  readonly baseUrl?: string;
  readonly redisUrl?: string;
}

const devLeaderCardId = "OP13-079" as CardId;

export interface DevDeckCardEntry {
  readonly cardId: CardId;
  readonly count: number;
}

const devDeckEntries = [
  { cardId: "OP13-080" as CardId, count: 4 },
  { cardId: "OP13-082" as CardId, count: 4 },
  { cardId: "OP13-083" as CardId, count: 4 },
  { cardId: "OP13-084" as CardId, count: 4 },
  { cardId: "OP13-089" as CardId, count: 4 },
  { cardId: "OP13-091" as CardId, count: 4 },
  { cardId: "OP13-099" as CardId, count: 4 },
  { cardId: "OP13-086" as CardId, count: 4 },
] as const;

export const createDevDeckCardIds = (
  entries: readonly DevDeckCardEntry[],
): CardId[] =>
  entries.flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.cardId),
  );

export const createDevManifestCardIds = (
  leaderCardId: CardId,
  entries: readonly DevDeckCardEntry[],
): CardId[] => {
  const cardIds = [leaderCardId, ...entries.map((entry) => entry.cardId)];
  return [...new Set(cardIds)];
};

const repeatedDeck = (): CardId[] => createDevDeckCardIds(devDeckEntries);

const donDeck = (): CardId[] =>
  Array.from(
    { length: 10 },
    (_, index) => `dev-don-${String(index + 1)}` as CardId,
  );

const playerSetup = (
  playerId: PlayerId,
  deckCardIds: CardId[],
  donDeckCardIds: CardId[],
): DevMatchPlayerSetup => ({
  playerId,
  leaderCardId: devLeaderCardId,
  leaderLifeCount: 4,
  deckCardIds,
  donDeckCardIds,
});

export const createDefaultDevMatchSetup = async (
  input: CreateDefaultDevMatchSetupInput,
): Promise<DevMatchSetup> => {
  const sharedDeck = repeatedDeck();
  const sharedDonDeck = donDeck();
  const cache =
    input.fetchCard === undefined
      ? await createRedisCardDataCache({
          url: input.redisUrl ?? process.env["REDIS_URL"] ?? defaultRedisUrl,
        })
      : undefined;
  return {
    matchId: input.matchId,
    firstPlayerId: input.firstPlayerId,
    rngSeed: "op13-dev-local-seed",
    playerOrder: input.playerOrder,
    players: [
      playerSetup(input.playerOrder[0], sharedDeck, sharedDonDeck),
      playerSetup(input.playerOrder[1], sharedDeck, sharedDonDeck),
    ],
    cardManifest: await buildDevMatchCardManifestFromPoneglyphIds({
      cardIds: createDevManifestCardIds(devLeaderCardId, devDeckEntries),
      createdAt: input.createdAt,
      devDonCount: 10,
      versions: {
        cardDataVersion: "live-poneglyph-dev-v1",
        effectDefinitionsVersion: "generated-dev-v1",
      },
      ...(cache === undefined ? {} : { cache }),
      ...(input.fetchCard === undefined ? {} : { fetchCard: input.fetchCard }),
      ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
    }),
    shuffleDecks: true,
  };
};

const defaultRedisUrl = "redis://localhost:6379";
