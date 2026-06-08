import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  DecisionId,
  EngineEventId,
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
          deckCardIds: [c1, c1, c2, c2, c2, c1],
          deckVariantIndexes: [0, 1, undefined, undefined, undefined, 1],
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
          [c1]: {
            ...vanillaCard(c1, "Variant Character", "character", [
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
            counter: 1000,
            attributes: ["special"],
            types: ["Dressrosa", "Navy"],
          },
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
    const defaultCardEntry = p1Catalog.cards[c1];
    if (defaultCardEntry === undefined) {
      throw new Error("Missing default C1 catalog entry.");
    }
    assert.equal(defaultCardEntry.imageUrl, "https://cdn.example/c1-v0.png");
    assert.equal(defaultCardEntry.counter, 1000);
    assert.deepEqual(defaultCardEntry.attributes, ["special"]);
    assert.deepEqual(defaultCardEntry.types, ["Dressrosa", "Navy"]);
  });

  test("preserves per-instance variants for public reveal cards", () => {
    const l1 = "L1" as CardId;
    const l2 = "L2" as CardId;
    const c1 = "C1" as CardId;
    const filler = "FILLER" as CardId;
    const match = createLocalDevMatch({
      matchId: "variant-reveal-match" as MatchId,
      firstPlayerId: p1,
      playerOrder: [p1, p2],
      rngSeed: "variant-reveal-seed",
      shuffleDecks: false,
      players: [
        {
          playerId: p1,
          leaderCardId: l1,
          leaderLifeCount: 0,
          deckCardIds: [filler, filler, filler, filler, filler, c1],
          deckVariantIndexes: [
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            1,
          ],
          donDeckCardIds: [],
        },
        {
          playerId: p2,
          leaderCardId: l2,
          leaderLifeCount: 0,
          deckCardIds: [filler, filler, filler, filler, filler],
          donDeckCardIds: [],
        },
      ],
      cardManifest: {
        manifestHash: "variant-reveal-manifest",
        source: "manual-test",
        cardDataVersion: "test",
        effectDefinitionsVersion: "test",
        customHandlerVersion: "test",
        banlistVersion: "test",
        createdAt: "2026-05-31T00:00:00.000Z",
        cards: {
          [l1]: vanillaCard(l1, "Leader One", "leader"),
          [l2]: vanillaCard(l2, "Leader Two", "leader"),
          [filler]: vanillaCard(filler, "Filler Character", "character"),
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
        },
      },
    });
    const revealed = match.state.players[p1]?.deck[0];
    if (revealed === undefined) {
      throw new Error("Missing revealed card.");
    }
    match.state.eventJournal.push({
      id: "event:test:variant-reveal" as EngineEventId,
      seq: 1,
      type: "cardRevealed",
      payload: {
        revealId: "reveal:test:variant",
        cards: [
          {
            instanceId: revealed.instanceId,
            cardId: revealed.cardId,
            playerId: p1,
          },
        ],
        origin: "topOfDeck",
      },
      visibility: { type: "public" },
      createdAtStateSeq: match.state.seq,
    });

    const catalog = getLocalDevCardCatalogForPlayer(match, p2);

    assert.equal(
      catalog.players[p1]?.instances?.[revealed.instanceId]?.imageUrl,
      "https://cdn.example/c1-v1.png",
    );
  });

  test("preserves per-instance variants for private order-card decisions", () => {
    const l1 = "L1" as CardId;
    const l2 = "L2" as CardId;
    const c1 = "C1" as CardId;
    const filler = "FILLER" as CardId;
    const match = createLocalDevMatch({
      matchId: "variant-order-match" as MatchId,
      firstPlayerId: p1,
      playerOrder: [p1, p2],
      rngSeed: "variant-order-seed",
      shuffleDecks: false,
      players: [
        {
          playerId: p1,
          leaderCardId: l1,
          leaderLifeCount: 0,
          deckCardIds: [filler, filler, filler, filler, filler, c1],
          deckVariantIndexes: [
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            1,
          ],
          donDeckCardIds: [],
        },
        {
          playerId: p2,
          leaderCardId: l2,
          leaderLifeCount: 0,
          deckCardIds: [filler, filler, filler, filler, filler],
          donDeckCardIds: [],
        },
      ],
      cardManifest: {
        manifestHash: "variant-order-manifest",
        source: "manual-test",
        cardDataVersion: "test",
        effectDefinitionsVersion: "test",
        customHandlerVersion: "test",
        banlistVersion: "test",
        createdAt: "2026-05-31T00:00:00.000Z",
        cards: {
          [l1]: vanillaCard(l1, "Leader One", "leader"),
          [l2]: vanillaCard(l2, "Leader Two", "leader"),
          [filler]: vanillaCard(filler, "Filler Character", "character"),
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
        },
      },
    });
    const looked = match.state.players[p1]?.deck[0];
    if (looked === undefined) {
      throw new Error("Missing looked card.");
    }
    match.state.pendingDecision = {
      id: "decision:orderCards:variant" as DecisionId,
      type: "orderCards",
      playerId: p1,
      prompt: "Place looked cards.",
      causedBy: { type: "ruleProcess", name: "test" },
      visibility: { type: "private", playerId: p1 },
      cards: [
        {
          instanceId: looked.instanceId,
          cardId: looked.cardId,
          playerId: p1,
          zone: looked.zone,
        },
      ],
      destination: "deck",
      placement: { type: "topOrBottom" },
    };

    const catalog = getLocalDevCardCatalogForPlayer(match, p1);

    assert.equal(
      catalog.players[p1]?.instances?.[looked.instanceId]?.imageUrl,
      "https://cdn.example/c1-v1.png",
    );
  });
});
