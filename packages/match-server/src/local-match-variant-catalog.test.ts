import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  InstanceId,
  MatchId,
  PlayerId,
  ResolvedCard,
  VariantKey,
} from "@optcg/types";

import {
  createLocalDevMatch,
  getLocalDevCardCatalogForPlayer,
} from "./local-match.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const vanillaCard = (
  cardId: CardId,
  name: string,
  category: ResolvedCard["category"],
  variants: ResolvedCard["variants"] = [],
): ResolvedCard => ({
  cardId,
  language: "en",
  name,
  category,
  set: "TEST",
  setName: "TEST",
  released: true,
  colors: ["black"],
  ...(category === "leader" ? { life: 5 } : { cost: 1, power: 1000 }),
  attributes: [],
  types: [],
  printedKeywords: [],
  variants,
  legality: {},
  officialFaq: [],
  errata: [],
  sourceTextHash: `${String(cardId)}-source`,
  behaviorHash: `${String(cardId)}-behavior`,
  support: {
    cardId,
    status: "vanilla-confirmed",
    tested: true,
    rulesVersion: "test",
    cardDataVersion: "test",
    sourceTextHash: `${String(cardId)}-source`,
    behaviorHash: `${String(cardId)}-behavior`,
  },
});

describe("local dev match variant catalog", () => {
  test("preserves per-instance deck hash variants outside engine state", () => {
    const l1 = "L1" as CardId;
    const l2 = "L2" as CardId;
    const c1 = "C1" as CardId;
    const c2 = "C2" as CardId;
    const match = createLocalDevMatch({
      matchId: "variant-match" as MatchId,
      firstPlayerId: p1,
      playerOrder: [p1, p2],
      rngSeed: "variant-seed",
      shuffleDecks: false,
      players: [
        {
          playerId: p1,
          leaderCardId: l1,
          leaderLifeCount: 0,
          leaderVariantIndex: 1,
          deckCardIds: [c1, c1, c2, c2, c2],
          deckVariantIndexes: [0, 1, undefined, undefined, undefined],
          donDeckCardIds: [],
        },
        {
          playerId: p2,
          leaderCardId: l2,
          leaderLifeCount: 0,
          deckCardIds: [c2, c2, c2, c2, c2],
          donDeckCardIds: [],
        },
      ],
      cardManifest: {
        manifestHash: "variant-manifest",
        source: "manual-test",
        cardDataVersion: "test",
        effectDefinitionsVersion: "test",
        customHandlerVersion: "test",
        banlistVersion: "test",
        createdAt: "2026-05-31T00:00:00.000Z",
        cards: {
          [l1]: vanillaCard(l1, "Leader One", "leader", [
            {
              variantKey: "L1:v0" as VariantKey,
              variantIndex: 0,
              stockImageFull: "https://cdn.example/l1-v0.png",
            },
            {
              variantKey: "L1:v1" as VariantKey,
              variantIndex: 1,
              stockImageFull: "https://cdn.example/l1-v1.png",
            },
          ]),
          [l2]: vanillaCard(l2, "Leader Two", "leader"),
          [c1]: vanillaCard(c1, "Variant Character", "character", [
            {
              variantKey: "C1:v0" as VariantKey,
              variantIndex: 0,
              stockImageFull: "https://cdn.example/c1-v0.png",
            },
            {
              variantKey: "C1:v1" as VariantKey,
              variantIndex: 1,
              stockImageFull: "https://cdn.example/c1-v1.png",
            },
          ]),
          [c2]: vanillaCard(c2, "Filler Character", "character"),
        },
      },
    });

    const catalog = getLocalDevCardCatalogForPlayer(match, p1);
    const p1Catalog = catalog.players[p1];
    if (p1Catalog === undefined) {
      throw new Error("Missing p1 catalog.");
    }
    const p1Instances = p1Catalog.instances;
    if (p1Instances === undefined) {
      throw new Error("Missing p1 instance catalog.");
    }

    assert.equal(
      p1Instances["p1:leader" as InstanceId]?.imageUrl,
      "https://cdn.example/l1-v1.png",
    );
    assert.equal(
      p1Instances["p1:deck:0:C1" as InstanceId]?.imageUrl,
      "https://cdn.example/c1-v0.png",
    );
    assert.equal(
      p1Instances["p1:deck:1:C1" as InstanceId]?.imageUrl,
      "https://cdn.example/c1-v1.png",
    );
    assert.equal(
      p1Catalog.cards[c1]?.imageUrl,
      "https://cdn.example/c1-v0.png",
    );
  });
});
