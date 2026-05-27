import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildDevMatchCardManifestFromPoneglyphIds,
  type DevPoneglyphFetch,
} from "@optcg/cards";
import type { CardId, MatchId, PlayerId } from "@optcg/types";

import type { DevMatchPlayerSetup, DevMatchSetup } from "./local-match.js";

const fixtureFiles: Record<string, string> = {
  "OP13-079": "OP13-079.imu.json",
  "OP13-080": "OP13-080.st-ethanbaron-v-nusjuro.json",
  "OP13-082": "OP13-082.five-elders.json",
  "OP13-083": "OP13-083.st-jaygarcia-saturn.json",
  "OP13-084": "OP13-084.st-shepherd-ju-peter.json",
  "OP13-086": "OP13-086.saint-shalria.json",
  "OP13-089": "OP13-089.st-topman-warcury.json",
  "OP13-091": "OP13-091.st-marcus-mars.json",
  "OP13-099": "OP13-099.the-empty-throne.json",
};

const fixturesRoot = new URL(
  "../../../fixtures/poneglyph/cards/",
  import.meta.url,
);

export const createDefaultDevFixtureFetch =
  (): DevPoneglyphFetch => async (url, init) => {
    if (!url.endsWith("/v1/cards/batch") || init?.method !== "POST") {
      return {
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      };
    }
    const body = JSON.parse(init.body ?? "{}") as {
      card_numbers?: string[];
    };
    const data: Record<string, unknown> = {};
    const missing: string[] = [];
    for (const cardId of body.card_numbers ?? []) {
      const fileName = fixtureFiles[cardId];
      if (fileName === undefined) {
        missing.push(cardId);
        continue;
      }
      const raw = await readFile(
        fileURLToPath(new URL(fileName, fixturesRoot)),
        "utf8",
      );
      data[cardId] = JSON.parse(raw) as unknown;
    }
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data, missing }),
    };
  };

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const fixtureLeaderCardId = "OP13-079" as CardId;
const fixtureDeckCardIds = [
  "OP13-080" as CardId,
  "OP13-082" as CardId,
  "OP13-083" as CardId,
  "OP13-084" as CardId,
  "OP13-089" as CardId,
  "OP13-091" as CardId,
  "OP13-099" as CardId,
] as const;

const repeatedFixtureDeck = (): CardId[] =>
  fixtureDeckCardIds.flatMap((cardId) =>
    Array.from({ length: 4 }, () => cardId),
  );

const fixtureDonDeck = (): CardId[] =>
  Array.from(
    { length: 10 },
    (_, index) => `test-don-${String(index + 1)}` as CardId,
  );

const fixturePlayerSetup = (
  playerId: PlayerId,
  deckCardIds: CardId[],
  donDeckCardIds: CardId[],
): DevMatchPlayerSetup => ({
  playerId,
  leaderCardId: fixtureLeaderCardId,
  leaderLifeCount: 4,
  deckCardIds,
  donDeckCardIds,
});

export const createFixtureDevMatchSetup = async (
  matchId = "test-dev-match" as MatchId,
): Promise<DevMatchSetup> => {
  const sharedDeck = repeatedFixtureDeck();
  const sharedDonDeck = fixtureDonDeck();
  return {
    matchId,
    firstPlayerId: p1,
    rngSeed: "fixture-dev-local-seed",
    playerOrder: [p1, p2],
    players: [
      fixturePlayerSetup(p1, sharedDeck, sharedDonDeck),
      fixturePlayerSetup(p2, sharedDeck, sharedDonDeck),
    ],
    cardManifest: await buildDevMatchCardManifestFromPoneglyphIds({
      cardIds: [fixtureLeaderCardId, ...fixtureDeckCardIds],
      createdAt: "2026-05-04T00:00:00.000Z",
      devDonCount: 10,
      versions: {
        cardDataVersion: "test-poneglyph-fixtures-v1",
        effectDefinitionsVersion: "generated-test-v1",
      },
      fetchCard: createDefaultDevFixtureFetch(),
    }),
    shuffleDecks: true,
  };
};
