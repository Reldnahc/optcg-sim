import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { CardId, PoneglyphCardDetail, ResolvedCard } from "@optcg/types";

import {
  createCardCacheKey,
  createCardRepository,
  type CachedResolvedCard,
  type CardDataCache,
  type CreateCardRepositoryInput,
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

const runtimeSupported = (): { readonly supported: true } => ({
  supported: true,
});

const createRuntimeSupportedCardRepository = (
  input: Omit<CreateCardRepositoryInput, "runtimeSupportEvaluator">,
) =>
  createCardRepository({
    ...input,
    runtimeSupportEvaluator: runtimeSupported,
  });

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
    const repository = createRuntimeSupportedCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const resolved = await repository.resolveCards([cardId]);

    assert.equal(client.batchRequests.length, 0);
    assert.deepEqual(resolved, [card]);
  });

  test("uses bulk cache reads when the cache supports them", async () => {
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
    const repository = createRuntimeSupportedCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    await repository.resolveCards([cachedId, fetchedId]);

    assert.equal(cache.getManyCalls, 1);
    assert.equal(cache.getCalls, 0);
    assert.deepEqual(client.batchRequests, [[fetchedId]]);
  });

  test("batch fetches missing cards, caches resolved cards, and preserves variant images", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP01-001" as CardId;
    const client = new FakePoneglyphClient({
      "OP01-001": poneglyphCard("OP01-001", "[On Play] Draw 1 card."),
    });
    const repository = createRuntimeSupportedCardRepository({
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

  test("returns cache warm entries with generated definitions", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP01-001" as CardId;
    const client = new FakePoneglyphClient({
      "OP01-001": poneglyphCard("OP01-001", "[On Play] Draw 1 card."),
    });
    const repository = createRuntimeSupportedCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const [maybeEntry] = await repository.resolveCacheEntries([cardId]);
    const entry = required(maybeEntry, "cache entry");

    assert.equal(entry.card.cardId, cardId);
    assert.equal(entry.definition?.cardId, cardId);
  });

  test("fails closed for parsed effect text without a runtime support evaluator", async () => {
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

    assert.equal(resolved.support.status, "unsupported");
    assert.equal(resolved.support.effectDefinitionId, undefined);
    assert.match(
      resolved.support.notes ?? "",
      /runtime evaluator unavailable/u,
    );
  });

  test("resolved implemented DSL card includes effect text source map", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP01-001" as CardId;
    const client = new FakePoneglyphClient({
      "OP01-001": poneglyphCard("OP01-001", "[On Play] Draw 1 card."),
    });
    const repository = createRuntimeSupportedCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const [maybeResolved] = await repository.resolveCards([cardId]);
    const resolved = required(maybeResolved, "resolved card");

    assert.equal(resolved.support.status, "implemented-dsl");
    assert.equal(resolved.effectTextSourceMap?.sourceText, resolved.effectText);
    assert.equal(
      resolved.effectTextSourceMap?.spans.some((span) =>
        span.primitiveEvidence?.includes("instruction:draw"),
      ),
      true,
    );
  });

  test("generated effect definitions include presentation refs from source maps", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP01-001" as CardId;
    const client = new FakePoneglyphClient({
      "OP01-001": poneglyphCard("OP01-001", "[On Play] Draw 1 card."),
    });
    const repository = createRuntimeSupportedCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    await repository.resolveCards([cardId]);
    const cached = (await cache.getJson(
      createCardCacheKey({ cardId, versions }),
    )) as CachedResolvedCard | undefined;
    const definition = required(cached?.definition, "cached definition");
    const effect = required(definition.effects[0], "generated effect");
    const presentation = required(effect.presentation, "effect presentation");

    assert.equal(presentation.textKind, "effect");
    assert.equal(
      presentation.spanIds.some((spanId) => spanId === "span:body"),
      true,
    );
  });

  test("generated choose-one effect definitions include the choice header presentation ref", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP01-001" as CardId;
    const client = new FakePoneglyphClient({
      "OP01-001": poneglyphCard(
        "OP01-001",
        [
          "[On Play] Choose one:",
          "\u2022 Draw 2 cards.",
          "\u2022 Rest up to 1 of your opponent's Characters.",
        ].join("\n"),
      ),
    });
    const repository = createRuntimeSupportedCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    await repository.resolveCards([cardId]);
    const cached = (await cache.getJson(
      createCardCacheKey({ cardId, versions }),
    )) as CachedResolvedCard | undefined;
    const definition = required(cached?.definition, "cached definition");
    const effect = required(definition.effects[0], "generated effect");
    const presentation = required(effect.presentation, "effect presentation");

    assert.equal(presentation.spanIds.includes("span:choice"), true);
  });

  test("multi-line generated effects use line-scoped presentation span ids", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP01-001" as CardId;
    const effect = [
      "[On Play] You may trash 1 card from your hand: If your Leader is [Rebecca]\u2060, this Character gains [Rush] during this turn.",
      "[On K.O.] Add this Character card from your trash to your hand.",
    ].join("\n");
    const client = new FakePoneglyphClient({
      "OP01-001": poneglyphCard("OP01-001", effect),
    });
    const repository = createRuntimeSupportedCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const [maybeResolved] = await repository.resolveCards([cardId]);
    const resolved = required(maybeResolved, "resolved card");
    const cached = (await cache.getJson(
      createCardCacheKey({ cardId, versions }),
    )) as CachedResolvedCard | undefined;
    const definition = required(cached?.definition, "cached definition");
    const onPlay = required(definition.effects[0], "on play effect");
    const onKo = required(definition.effects[1], "on ko effect");
    const onPlayPresentation = required(
      onPlay.presentation,
      "on play presentation",
    );
    const onKoPresentation = required(onKo.presentation, "on ko presentation");
    const sourceMap = required(
      resolved.effectTextSourceMap,
      "effect text source map",
    );
    const sourceSpanIds = sourceMap.spans.map((span) => span.id);

    assert.equal(new Set(sourceSpanIds).size, sourceSpanIds.length);
    assert.deepEqual(onPlayPresentation.spanIds, [
      "span:cost:optional:line:1",
      "span:body:line:1",
    ]);
    assert.deepEqual(onKoPresentation.spanIds, ["span:body:line:2"]);
    for (const spanId of [
      ...onPlayPresentation.spanIds,
      ...onKoPresentation.spanIds,
    ]) {
      assert.equal(sourceSpanIds.includes(spanId), true);
    }
  });

  test("resolves raw keyword lines as printed keywords without generated effect blocks", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP01-001" as CardId;
    const client = new FakePoneglyphClient({
      "OP01-001": poneglyphCard(
        "OP01-001",
        "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
      ),
    });
    const repository = createRuntimeSupportedCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const [maybeResolved] = await repository.resolveCards([cardId]);
    const resolved = required(maybeResolved, "resolved card");

    assert.deepEqual(resolved.printedKeywords, ["blocker"]);
    assert.equal(resolved.support.status, "implemented-dsl");
    assert.equal(resolved.support.effectDefinitionId, undefined);
  });

  test("resolves recognized deck restriction metadata as playable without generated effects", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP16-042" as CardId;
    const client = new FakePoneglyphClient({
      "OP16-042": poneglyphCard(
        "OP16-042",
        "Under the rules of this game, you may have any number of this card in your deck.",
      ),
    });
    const repository = createRuntimeSupportedCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const [maybeResolved] = await repository.resolveCards([cardId]);
    const resolved = required(maybeResolved, "resolved card");

    assert.equal(resolved.support.status, "implemented-dsl");
    assert.equal(resolved.support.effectDefinitionId, undefined);
    assert.equal(resolved.support.tested, true);
  });

  test("ignores fully parenthesized reminder lines when building generated effects", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP01-001" as CardId;
    const client = new FakePoneglyphClient({
      "OP01-001": poneglyphCard(
        "OP01-001",
        [
          "If you have 6 or less DON!! cards on your field, this Character gains [Rush].",
          "(This card can attack on the turn in which it is played.)",
          "[On Play] DON!! \u22121: Draw 1 card.",
        ].join("\n"),
      ),
    });
    const repository = createRuntimeSupportedCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const [maybeResolved] = await repository.resolveCards([cardId]);
    const resolved = required(maybeResolved, "resolved card");

    assert.equal(resolved.support.status, "implemented-dsl");
    const definition = required(
      resolved.support.effectDefinitionId,
      "effect id",
    );
    assert.equal(definition, "OP01-001.generated-dev-support");
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
    const repository = createRuntimeSupportedCardRepository({
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
    const repository = createRuntimeSupportedCardRepository({
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

  test("builds multiple generated blocks from one slash-entry Poneglyph line", async () => {
    const cache = new FakeCardCache();
    const cardId = "OP01-003" as CardId;
    const client = new FakePoneglyphClient({
      "OP01-003": poneglyphCard(
        "OP01-003",
        "[On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.",
      ),
    });
    const repository = createRuntimeSupportedCardRepository({
      cache,
      poneglyphClient: client,
      versions,
    });

    const manifest = await repository.buildMatchManifest({
      cardIds: [cardId],
      devDonCount: 1,
    });

    const definitionId = manifest.cards[cardId]?.support.effectDefinitionId;
    assert.ok(definitionId);
    const definition = manifest.effectDefinitions?.[definitionId];
    assert.ok(definition);
    assert.deepEqual(
      definition.effects.map((effect) => effect.trigger),
      [{ type: "onPlay" }, { type: "whenAttacking" }],
    );
    assert.deepEqual(
      definition.effects.map((effect) => effect.id),
      ["OP01-003:generated:1:1", "OP01-003:generated:1:2"],
    );
  });

  test("fails clearly when Poneglyph reports missing cards", async () => {
    const repository = createRuntimeSupportedCardRepository({
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
  getCalls = 0;
  getManyCalls = 0;

  getJson(key: string): Promise<unknown> {
    this.getCalls += 1;
    return Promise.resolve(this.store.get(key));
  }

  getJsonMany(keys: readonly string[]): Promise<readonly unknown[]> {
    this.getManyCalls += 1;
    return Promise.resolve(keys.map((key) => this.store.get(key)));
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
