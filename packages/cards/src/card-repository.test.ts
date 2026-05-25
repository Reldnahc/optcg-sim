import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { CardId, PoneglyphCardDetail, ResolvedCard } from "@optcg/types";

import {
  createCardCacheKey,
  createCardRepository,
  type CachedResolvedCard,
  type CardDataCache,
  type CardRepositoryVersions,
  type PoneglyphClient,
} from "./card-repository.js";

const versions: CardRepositoryVersions = {
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  overlayVersion: "none",
  customHandlerVersion: "none",
  banlistVersion: "none",
  rulesVersion: "rules-v1",
};

describe("card repository", () => {
  test("returns cached resolved cards without calling Poneglyph", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP01-001" as CardId;
    const card = resolvedCard(cardId);
    await cache.setJson(createCardCacheKey({ cardId, versions }), {
      cacheSchemaVersion: 1,
      versions,
      card,
    } satisfies CachedResolvedCard);
    const client = new FakePoneglyphClient({});
    const repository = createCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const resolved = await repository.resolveCards([cardId]);

    assert.equal(client.batchRequests.length, 0);
    assert.deepEqual(resolved, [card]);
  });

  test("batch fetches missing cards, caches resolved cards, and preserves variant images", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP01-001" as CardId;
    const client = new FakePoneglyphClient({
      "OP01-001": poneglyphCard("OP01-001", "[On Play] Draw 1 card."),
    });
    const repository = createCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const [maybeResolved] = await repository.resolveCards([cardId]);
    const resolved = required(maybeResolved, "resolved card");

    assert.deepEqual(client.batchRequests, [[cardId]]);
    assert.equal(resolved.support.status, "implemented-dsl");
    const variant = required(resolved.variants[0], "resolved variant");
    assert.equal(
      variant.stockImageFull,
      "https://cdn.example/OP01-001/full.png",
    );
    assert.equal(
      variant.scanImageThumb,
      "https://cdn.example/OP01-001/scan-thumb.png",
    );
    const cached = (await cache.getJson(
      createCardCacheKey({ cardId, versions }),
    )) as CachedResolvedCard | undefined;
    const cachedCard = required(cached, "cached card");
    const cachedDefinition = required(
      cachedCard.definition,
      "cached definition",
    );
    assert.equal(cachedCard.card.cardId, cardId);
    assert.equal(cachedDefinition.cardId, cardId);
  });

  test("fetches only uncached cards and returns results in caller order", async () => {
    const cache = new FakeCardCache();
    const cachedId = "OP01-001" as CardId;
    const fetchedId = "OP01-002" as CardId;
    await cache.setJson(createCardCacheKey({ cardId: cachedId, versions }), {
      cacheSchemaVersion: 1,
      versions,
      card: resolvedCard(cachedId),
    } satisfies CachedResolvedCard);
    const client = new FakePoneglyphClient({
      "OP01-002": poneglyphCard("OP01-002", null),
    });
    const repository = createCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const resolved = await repository.resolveCards([
      fetchedId,
      cachedId,
      fetchedId,
    ]);

    assert.deepEqual(client.batchRequests, [[fetchedId]]);
    assert.deepEqual(
      resolved.map((card) => card.cardId),
      [fetchedId, cachedId, fetchedId],
    );
  });

  test("builds a match manifest from repository-resolved cards and supported definitions", async () => {
    const cache = new FakeCardCache();
    const client = new FakePoneglyphClient({
      "OP01-001": poneglyphCard("OP01-001", "[On Play] Draw 1 card."),
      "OP01-002": poneglyphCard("OP01-002", "Unsupported text."),
    });
    const repository = createCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const manifest = await repository.buildMatchManifest({
      cardIds: ["OP01-001", "OP01-002", "OP01-001"] as CardId[],
      createdAt: "2026-05-25T00:00:00.000Z",
      devDonCount: 1,
    });

    assert.equal(manifest.source, "poneglyph");
    assert.equal(manifest.cardDataVersion, versions.cardDataVersion);
    assert.ok(manifest.cards["OP01-001" as CardId]);
    assert.ok(manifest.cards["OP01-002" as CardId]);
    assert.ok(manifest.cards["dev-don-1" as CardId]);
    const supportedDefinitionId =
      manifest.cards["OP01-001" as CardId]?.support.effectDefinitionId;
    assert.ok(supportedDefinitionId);
    assert.ok(manifest.effectDefinitions?.[supportedDefinitionId]);
    assert.equal(
      manifest.cards["OP01-002" as CardId]?.support.effectDefinitionId,
      undefined,
    );
  });

  test("fails clearly when Poneglyph reports missing cards", async () => {
    const repository = createCardRepository({
      cache: new FakeCardCache(),
      poneglyphClient: new FakePoneglyphClient({}),
      versions,
    });

    await assert.rejects(
      () => repository.resolveCards(["OP01-404" as CardId]),
      /missing OP01-404/u,
    );
  });
});

class FakeCardCache implements CardDataCache {
  readonly store = new Map<string, unknown>();

  getJson(key: string): Promise<unknown> {
    return Promise.resolve(this.store.get(key));
  }

  setJson(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }
}

class FakePoneglyphClient implements PoneglyphClient {
  readonly batchRequests: CardId[][] = [];

  constructor(private readonly cards: Record<string, PoneglyphCardDetail>) {}

  getCardsBatch(cardIds: readonly CardId[]): Promise<{
    readonly data: Record<string, PoneglyphCardDetail>;
    readonly missing: readonly string[];
  }> {
    this.batchRequests.push([...cardIds]);
    const data: Record<string, PoneglyphCardDetail> = {};
    const missing: string[] = [];
    for (const cardId of cardIds) {
      const card = this.cards[cardId];
      if (card === undefined) {
        missing.push(cardId);
      } else {
        data[cardId] = card;
      }
    }
    return Promise.resolve({ data, missing });
  }
}

const resolvedCard = (cardId: CardId): ResolvedCard => {
  const sourceTextHash = `source-${String(cardId)}`;
  const behaviorHash = `behavior-${String(cardId)}`;
  return {
    cardId,
    language: "en",
    name: String(cardId),
    category: "character",
    set: "DEV",
    setName: "Dev Set",
    released: true,
    colors: ["blue"],
    attributes: ["special"],
    types: ["Test"],
    printedKeywords: [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash,
    behaviorHash,
    support: {
      cardId,
      status: "vanilla-confirmed",
      tested: true,
      rulesVersion: versions.rulesVersion,
      cardDataVersion: versions.cardDataVersion,
      sourceTextHash,
      behaviorHash,
    },
  };
};

const poneglyphCard = (
  cardNumber: string,
  effect: string | null,
): PoneglyphCardDetail => ({
  card_number: cardNumber,
  name: cardNumber,
  language: "en",
  set: "DEV",
  set_name: "Dev Set",
  released_at: null,
  released: true,
  card_type: "Character",
  rarity: null,
  color: ["Blue"],
  cost: 1,
  power: 1000,
  counter: 1000,
  life: null,
  attribute: ["Special"],
  types: ["Test"],
  effect,
  trigger: null,
  block: null,
  variants: [
    {
      index: 0,
      name: null,
      label: "Parallel",
      artist: "Artist",
      product: {
        id: "product-1",
        slug: "product-slug",
        name: "Product",
        set_code: "DEV",
        released_at: null,
      },
      images: {
        stock: {
          full: `https://cdn.example/${cardNumber}/full.png`,
          thumb: `https://cdn.example/${cardNumber}/thumb.png`,
        },
        scan: {
          display: `https://cdn.example/${cardNumber}/scan-display.png`,
          full: `https://cdn.example/${cardNumber}/scan-full.png`,
          thumb: `https://cdn.example/${cardNumber}/scan-thumb.png`,
        },
      },
      errata: [],
      market: {
        tcgplayer_url: null,
        market_price: null,
        low_price: null,
        mid_price: null,
        high_price: null,
      },
    },
  ],
  legality: {},
  available_languages: ["en"],
  official_faq: [],
});

const required = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Missing ${label}.`);
  }
  return value;
};
