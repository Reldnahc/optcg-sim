import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { CardId, ResolvedCard, VariantKey } from "@optcg/types";

import {
  createDeckValidationCacheKey,
  normalizeDeckLoadoutIdentity,
  validateDeckLoadout,
  type DeckValidationCachePort,
  type DeckValidationInput,
} from "./deck-validation.js";

const versions = {
  validatorVersion: "test-validator-v1",
  cardDataVersion: "card-data-v1",
  effectDefinitionsVersion: "effects-v1",
  overlayVersion: "overlay-v1",
  banlistVersion: "banlist-v1",
  rulesVersion: "rules-v1",
};

const memoryCache = (): DeckValidationCachePort & {
  readonly keys: () => readonly string[];
} => {
  const values = new Map<string, unknown>();
  return {
    getJson: (key) => Promise.resolve(values.get(key)),
    setJson: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    keys: () => [...values.keys()],
  };
};

const card = (
  cardId: string,
  patch: Partial<ResolvedCard> = {},
): ResolvedCard => ({
  cardId: cardId as CardId,
  language: "en",
  name: cardId,
  category: "character",
  set: "TEST",
  setName: "Test",
  released: true,
  colors: ["black"],
  attributes: [],
  types: [],
  printedKeywords: [],
  variants: [
    { variantIndex: 0, variantKey: `${cardId}:v0` as VariantKey },
    { variantIndex: 3, variantKey: `${cardId}:v3` as VariantKey },
  ],
  legality: { standard: { status: "legal" } },
  officialFaq: [],
  errata: [],
  sourceTextHash: `${cardId}:source`,
  behaviorHash: `${cardId}:behavior`,
  support: {
    cardId: cardId as CardId,
    status: "implemented-dsl",
    tested: true,
    rulesVersion: "rules-v1",
    cardDataVersion: "card-data-v1",
    sourceTextHash: `${cardId}:source`,
    behaviorHash: `${cardId}:behavior`,
  },
  ...patch,
});

const validInput = (
  patch: Partial<DeckValidationInput> = {},
): DeckValidationInput => ({
  formatId: "standard",
  mainDeck: {
    source: "deckHash",
    hash: "main-hash",
    status: "ready",
    decoded: {
      leader: { cardId: "LDR-001" as CardId, count: 1, variantIndex: 3 },
      main: [
        { cardId: "CHR-001" as CardId, count: 49, variantIndex: 0 },
        { cardId: "EVT-001" as CardId, count: 1, variantIndex: 3 },
      ],
    },
    donDeckCount: 10,
  },
  donDeck: {
    source: "explicit",
    entries: [{ cardId: "DON-001" as CardId, count: 10, variantIndex: 3 }],
  },
  cards: {
    ["LDR-001" as CardId]: card("LDR-001", {
      category: "leader",
      life: 5,
      effectText:
        "Under the rules of this game, your DON!! deck consists of 6 cards.",
    }),
    ["CHR-001" as CardId]: card("CHR-001"),
    ["EVT-001" as CardId]: card("EVT-001", {
      category: "event",
      cost: 1,
    }),
    ["DON-001" as CardId]: card("DON-001", {
      category: "don",
    }),
  },
  versions,
  ...patch,
});

describe("deck validation", () => {
  test("normalizes gameplay identity without variant indexes", () => {
    const first = normalizeDeckLoadoutIdentity(validInput());
    const second = normalizeDeckLoadoutIdentity(
      validInput({
        mainDeck: {
          source: "deckHash",
          hash: "different-cosmetic-hash",
          status: "ready",
          decoded: {
            leader: { cardId: "LDR-001" as CardId, count: 1 },
            main: [
              { cardId: "EVT-001" as CardId, count: 1 },
              { cardId: "CHR-001" as CardId, count: 49, variantIndex: 3 },
            ],
          },
          donDeckCount: 10,
        },
        donDeck: {
          source: "explicit",
          entries: [{ cardId: "DON-001" as CardId, count: 10 }],
        },
      }),
    );

    assert.equal(first.digest, second.digest);
    assert.deepEqual(first.identity.main, [
      { cardId: "CHR-001", count: 49 },
      { cardId: "EVT-001", count: 1 },
    ]);
    assert.deepEqual(first.identity.donDeck, [
      "DON-001",
      "DON-001",
      "DON-001",
      "DON-001",
      "DON-001",
      "DON-001",
      "DON-001",
      "DON-001",
      "DON-001",
      "DON-001",
    ]);
  });

  test("uses a Redis-compatible cache key that ignores cosmetic variants", async () => {
    const cache = memoryCache();
    const first = await validateDeckLoadout({ ...validInput(), cache });
    const second = await validateDeckLoadout({
      ...validInput({
        mainDeck: {
          source: "deckHash",
          hash: "same-cards-different-variants",
          status: "ready",
          decoded: {
            leader: { cardId: "LDR-001" as CardId, count: 1 },
            main: [
              { cardId: "CHR-001" as CardId, count: 49, variantIndex: 3 },
              { cardId: "EVT-001" as CardId, count: 1 },
            ],
          },
          donDeckCount: 10,
        },
      }),
      cache,
    });

    assert.equal(first.valid, true);
    assert.equal(second.valid, true);
    assert.equal(first.cacheStatus, "miss");
    assert.equal(second.cacheStatus, "hit");
    assert.equal(cache.keys().length, 1);
    assert.equal(
      cache.keys()[0],
      createDeckValidationCacheKey({
        digest: first.normalizedDeckDigest,
        formatId: "standard",
        versions,
      }),
    );
  });

  test("adapts a longer submitted DON deck to a shorter deck-rule requirement", async () => {
    const result = await validateDeckLoadout(validInput());

    assert.equal(result.valid, true);
    assert.equal(result.requestedDonDeck.cards.length, 10);
    assert.equal(result.matchDonDeck.cards.length, 6);
    assert.deepEqual(result.constructionRules, [
      {
        sourceCardId: "LDR-001",
        type: "donDeckSize",
        count: 6,
      },
    ]);
  });

  test("rejects main decks that do not contain exactly 50 cards", async () => {
    const result = await validateDeckLoadout(
      validInput({
        mainDeck: {
          source: "deckHash",
          hash: "short-main-deck",
          status: "ready",
          decoded: {
            leader: { cardId: "LDR-001" as CardId, count: 1 },
            main: [{ cardId: "CHR-001" as CardId, count: 49 }],
          },
          donDeckCount: 10,
        },
      }),
    );

    assert.equal(result.valid, false);
    assert.deepEqual(
      result.errors.map((error) => error.code),
      ["invalidMainDeckSize"],
    );
  });

  test("rejects deck submissions that do not contain exactly one leader", async () => {
    const result = await validateDeckLoadout(
      validInput({
        mainDeck: {
          source: "deckHash",
          hash: "two-leaders",
          status: "ready",
          decoded: {
            leader: { cardId: "LDR-001" as CardId, count: 2 },
            main: [{ cardId: "CHR-001" as CardId, count: 50 }],
          },
          donDeckCount: 10,
        },
      }),
    );

    assert.equal(result.valid, false);
    assert.deepEqual(
      result.errors.map((error) => error.code),
      ["invalidLeader"],
    );
  });

  test("rejects a submitted DON deck that is shorter than the match requirement", async () => {
    const result = await validateDeckLoadout(
      validInput({
        donDeck: {
          source: "explicit",
          entries: [{ cardId: "DON-001" as CardId, count: 5 }],
        },
      }),
    );

    assert.equal(result.valid, false);
    assert.deepEqual(
      result.errors.map((error) => error.code),
      ["donDeckTooShort"],
    );
  });

  test("applies reusable deck construction restrictions from card text", async () => {
    const result = await validateDeckLoadout(
      validInput({
        cards: {
          ["LDR-001" as CardId]: card("LDR-001", {
            category: "leader",
            life: 5,
            effectText:
              "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck and at the start of the game, play up to 1 {Example} type Stage card from your deck.",
          }),
          ["CHR-001" as CardId]: card("CHR-001"),
          ["EVT-001" as CardId]: card("EVT-001", {
            category: "event",
            cost: 3,
          }),
          ["DON-001" as CardId]: card("DON-001", {
            category: "don",
          }),
        },
      }),
    );

    assert.equal(result.valid, false);
    assert.deepEqual(
      result.errors.map((error) => error.code),
      ["deckRuleViolation"],
    );
  });

  test("rejects cards that are not playable by the simulator implementation", async () => {
    const result = await validateDeckLoadout(
      validInput({
        cards: {
          ["LDR-001" as CardId]: card("LDR-001", {
            category: "leader",
            life: 5,
          }),
          ["CHR-001" as CardId]: card("CHR-001", {
            support: {
              cardId: "CHR-001" as CardId,
              status: "unsupported",
              tested: false,
              rulesVersion: "rules-v1",
              cardDataVersion: "card-data-v1",
              sourceTextHash: "CHR-001:source",
              behaviorHash: "CHR-001:behavior",
            },
          }),
          ["EVT-001" as CardId]: card("EVT-001", {
            category: "event",
            cost: 1,
          }),
          ["DON-001" as CardId]: card("DON-001", {
            category: "don",
          }),
        },
      }),
    );

    assert.equal(result.valid, false);
    assert.deepEqual(
      result.errors.map((error) => error.code),
      ["unsupportedCard"],
    );
  });
});
