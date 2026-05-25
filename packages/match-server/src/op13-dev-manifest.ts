import {
  buildDevMatchCardManifestFromPoneglyphIds,
  parseDevCardIdList,
  type DevPoneglyphFetch,
} from "@optcg/cards";
import type { CardId, PlayerId } from "@optcg/types";

import type { DevMatchPlayerSetup, DevMatchSetup } from "./local-match.js";

interface CreateOp13DevMatchSetupInput {
  readonly matchId: DevMatchSetup["matchId"];
  readonly firstPlayerId: PlayerId;
  readonly playerOrder: readonly [PlayerId, PlayerId];
  readonly createdAt: string;
  readonly fetchCard?: DevPoneglyphFetch;
  readonly baseUrl?: string;
}

const devLeaderCardId = "OP13-079" as CardId;

const devDeckCardIds = [
  "OP13-080",
  "OP13-082",
  "OP13-083",
  "OP13-084",
  "OP13-089",
  "OP13-091",
  "OP13-099",
] as const;

const devCardIdsText = `
OP13-079
OP13-080
OP13-082
OP13-083
OP13-084
OP13-089
OP13-091
OP13-099
`;

const repeatedDeck = (): CardId[] =>
  devDeckCardIds.flatMap((cardId) =>
    Array.from({ length: 4 }, () => cardId as CardId),
  );

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

export const createOp13DevMatchSetup = async (
  input: CreateOp13DevMatchSetupInput,
): Promise<DevMatchSetup> => {
  const sharedDeck = repeatedDeck();
  const sharedDonDeck = donDeck();
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
      cardIds: parseDevCardIdList(devCardIdsText),
      createdAt: input.createdAt,
      devDonCount: 10,
      versions: {
        cardDataVersion: "live-poneglyph-dev-v1",
        effectDefinitionsVersion: "generated-dev-v1",
      },
      ...(input.fetchCard === undefined ? {} : { fetchCard: input.fetchCard }),
      ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
    }),
    shuffleDecks: true,
  };
};
