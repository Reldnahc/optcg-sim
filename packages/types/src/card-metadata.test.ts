import { expect, test } from "vitest";

import type {
  Attribute,
  CardCategory,
  CardColor,
  CardId,
  EffectDefinition,
  CardImplementationRecord,
  CardMetadata,
  CardRef,
  CardSnapshot,
  CardSupportStatus,
  DeckValidationResult,
  DecklistEntry,
  EffectTextSourceMap,
  Loadout,
  MatchCardManifest,
  MatchSource,
  PoneglyphCardDetail,
  PoneglyphVariant,
  PlayerId,
  ResolvedCard,
  VariantKey,
  ZoneRef,
} from "./index.js";

test("deck entries and loadouts accept base card IDs plus optional variant keys", () => {
  const baseCardId = "OP01-060" as CardId;
  const altVariant = "OP01-060:v1" as VariantKey;
  const baseVariant = "OP01-060:v0" as VariantKey;

  const deck: DecklistEntry[] = [
    { cardId: baseCardId, quantity: 2, variantKey: baseVariant },
    { cardId: baseCardId, quantity: 2, variantKey: altVariant },
    { cardId: baseCardId, quantity: 1 },
  ];

  const loadout: Loadout = {
    loadoutId: "loadout-1" as Loadout["loadoutId"],
    ownerPlayerId: "player-1" as PlayerId,
    name: "split-variants",
    deck,
    cardVariants: {
      [baseCardId]: altVariant,
    },
  };

  expect(loadout.deck).toHaveLength(3);
  expect(loadout.cardVariants?.[baseCardId]).toBe(altVariant);
});

test("poneglyph and resolved/deck validation fixtures compile against canonical shapes", () => {
  const source: MatchSource = "poneglyph-fixture";
  const category: CardCategory = "character";
  const color: CardColor = "red";
  const attribute: Attribute = "strike";
  const keyword = "rush" as const;
  const status: CardSupportStatus = "implemented-dsl";
  const zoneRef: ZoneRef = {
    zone: "characterArea",
    playerId: "player-1" as PlayerId,
  };
  const cardRef: CardRef = {
    instanceId: "instance-1" as CardRef["instanceId"],
    cardId: "OP01-060" as CardId,
    playerId: "player-1" as PlayerId,
    zone: zoneRef,
  };
  const cardSnapshot: CardSnapshot = {
    instanceId: cardRef.instanceId,
    cardId: cardRef.cardId,
    ownerId: cardRef.playerId,
    controllerId: cardRef.playerId,
    zone: zoneRef,
    category,
    colors: [color],
    keywords: [keyword],
  };

  const variant: PoneglyphVariant = {
    index: 0,
    name: null,
    label: "Default",
    artist: null,
    product: {
      id: null,
      slug: null,
      name: null,
      set_code: null,
      released_at: null,
    },
    images: {
      stock: { full: null, thumb: null },
      scan: { display: null, full: null, thumb: null },
    },
    errata: [],
    market: {
      tcgplayer_url: null,
      market_price: null,
      low_price: null,
      mid_price: null,
      high_price: null,
    },
  };

  const poneglyphDetail: PoneglyphCardDetail = {
    card_number: "OP01-060",
    name: "Sample Card",
    language: "en",
    set: "OP01",
    set_name: "Romance Dawn",
    released_at: null,
    released: true,
    card_type: "Character",
    rarity: "SR",
    color: ["red"],
    cost: 5,
    power: 7000,
    counter: 1000,
    life: null,
    attribute: ["strike"],
    types: ["Supernovas"],
    effect: "Sample effect",
    trigger: null,
    block: null,
    variants: [variant],
    legality: { standard: { status: "legal" } },
    available_languages: ["en"],
    official_faq: [],
  };

  const support: CardImplementationRecord = {
    cardId: cardRef.cardId,
    status,
    tested: true,
    rulesVersion: "1.0.0",
    cardDataVersion: "2026-01-01",
    sourceTextHash: "hash-text",
    behaviorHash: "hash-behavior",
  };

  const metadata: CardMetadata = {
    cardId: cardRef.cardId,
    source,
    name: poneglyphDetail.name,
    category,
    colors: [color],
    cost: 5,
    power: 7000,
    counter: 1000,
    types: poneglyphDetail.types,
    attributes: [attribute],
    text: poneglyphDetail.effect ?? "",
    variants: [{ variantKey: "OP01-060:v0" as VariantKey, variantIndex: 0 }],
    sourceTextHash: support.sourceTextHash,
  };

  const resolvedCard: ResolvedCard = {
    cardId: metadata.cardId,
    language: poneglyphDetail.language,
    name: metadata.name,
    category: metadata.category,
    set: poneglyphDetail.set,
    setName: poneglyphDetail.set_name,
    released: poneglyphDetail.released,
    rarity: poneglyphDetail.rarity ?? "SR",
    colors: [color],
    cost: poneglyphDetail.cost ?? 5,
    power: poneglyphDetail.power ?? 7000,
    counter: poneglyphDetail.counter ?? 1000,
    attributes: [attribute],
    types: metadata.types ?? [],
    effectText: poneglyphDetail.effect ?? "",
    printedKeywords: [keyword],
    variants: [{ variantKey: "OP01-060:v0" as VariantKey, variantIndex: 0 }],
    legality: poneglyphDetail.legality,
    officialFaq: poneglyphDetail.official_faq,
    errata: [],
    sourceTextHash: support.sourceTextHash,
    behaviorHash: support.behaviorHash,
    support,
  };

  const manifest: MatchCardManifest = {
    manifestHash: "manifest-hash",
    source,
    cardDataVersion: support.cardDataVersion,
    effectDefinitionsVersion: "effects-v1",
    customHandlerVersion: "handlers-v1",
    banlistVersion: "banlist-v1",
    effectDefinitions: {},
    cards: { [resolvedCard.cardId]: resolvedCard },
    createdAt: "2026-05-03T00:00:00.000Z",
  };

  const validationResult: DeckValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    resolvedCards: [
      {
        cardId: resolvedCard.cardId,
        quantity: 4,
        variants: ["OP01-060:v0" as VariantKey, "OP01-060:v1" as VariantKey],
        resolvedCard,
      },
    ],
    versions: {
      cardDataVersion: manifest.cardDataVersion,
      effectDefinitionsVersion: manifest.effectDefinitionsVersion,
      overlayVersion: "overlay-v1",
      banlistVersion: manifest.banlistVersion,
    },
  };

  expect(cardSnapshot.cardId).toBe(cardRef.cardId);
  expect(validationResult.valid).toBe(true);
});

test("match card manifest accepts an empty effect definition registry", () => {
  const manifest: MatchCardManifest = {
    manifestHash: "manifest-empty-effects",
    source: "manual-test",
    cardDataVersion: "2026-05-05",
    effectDefinitionsVersion: "0.1.0",
    customHandlerVersion: "handlers-v1",
    banlistVersion: "banlist-v1",
    effectDefinitions: {},
    cards: {},
    createdAt: "2026-05-05T00:00:00.000Z",
  };

  expect(manifest.effectDefinitions).toEqual({});
});

test("resolved card can carry effect and trigger source maps", () => {
  const cardId = "OP00-001" as CardId;
  const map: EffectTextSourceMap = {
    textKind: "effect",
    sourceText: "[On Play] Draw 1 card.",
    spans: [
      {
        id: "span:body:draw",
        role: "body",
        start: 10,
        end: 22,
        text: "Draw 1 card.",
      },
    ],
  };
  const support: CardImplementationRecord = {
    cardId,
    status: "implemented-dsl",
    tested: true,
    rulesVersion: "rules",
    cardDataVersion: "cards",
    sourceTextHash: "hash",
    behaviorHash: "behavior",
  };
  const card: ResolvedCard = {
    cardId,
    language: "en",
    name: "Test",
    category: "character",
    set: "TEST",
    setName: "Test",
    released: true,
    colors: ["red"],
    attributes: [],
    types: [],
    effectText: map.sourceText,
    printedKeywords: [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash: support.sourceTextHash,
    behaviorHash: support.behaviorHash,
    effectTextSourceMap: map,
    triggerTextSourceMap: { ...map, textKind: "trigger" },
    support,
  };

  expect(card.effectTextSourceMap?.spans[0]?.id).toBe("span:body:draw");
  expect(card.triggerTextSourceMap?.textKind).toBe("trigger");
});

test("implemented-dsl support can reference a reviewed On Play draw effect definition from manifest registry", () => {
  const cardId = "OP01-015" as CardId;
  const effectDefinitionId = "op01-015.v2026-01-16.reviewed.on-play-draw-1";
  const support: CardImplementationRecord = {
    cardId,
    status: "implemented-dsl",
    effectDefinitionId,
    tested: true,
    rulesVersion: "2026-01-16",
    cardDataVersion: "2026-01-16",
    sourceTextHash: "sha256:test-op01-015",
    behaviorHash: "sha256:behavior-op01-015",
  };

  const definition: EffectDefinition = {
    cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: "OP01-015:auto-on-play-1" as EffectDefinition["effects"][number]["id"],
        category: "auto",
        trigger: { type: "onPlay" },
        optional: false,
        oncePerTurn: false,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: { type: "draw", count: 1, player: "self" },
      },
    ],
    metadata: {
      sourceTextHash: support.sourceTextHash,
      rulesVersion: support.rulesVersion,
      effectDefinitionsVersion: "0.1.0",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };

  const manifest: MatchCardManifest = {
    manifestHash: "manifest-reviewed-effects",
    source: "manual-test",
    cardDataVersion: support.cardDataVersion,
    effectDefinitionsVersion: definition.metadata.effectDefinitionsVersion,
    customHandlerVersion: "handlers-v1",
    banlistVersion: "banlist-v1",
    effectDefinitions: {
      [effectDefinitionId]: definition,
    },
    cards: {
      [cardId]: {
        cardId,
        language: "en",
        name: "Nami",
        category: "character",
        set: "OP01",
        setName: "Romance Dawn",
        released: true,
        colors: ["red"],
        attributes: ["wisdom"],
        types: ["Straw Hat Crew"],
        printedKeywords: [],
        variants: [],
        legality: {},
        officialFaq: [],
        errata: [],
        sourceTextHash: support.sourceTextHash,
        behaviorHash: support.behaviorHash,
        support,
      },
    },
    createdAt: "2026-05-05T00:00:00.000Z",
  };

  const linkedDefinition = (manifest.effectDefinitions ?? {})[
    support.effectDefinitionId ?? ""
  ];
  expect(linkedDefinition?.cardId).toBe(support.cardId);
});

test("attribute type accepts printed question-mark canonical value", () => {
  const attribute: Attribute = "?";
  const metadata: CardMetadata = {
    cardId: "OP13-079" as CardId,
    source: "poneglyph-fixture",
    name: "Question Mark Attribute Card",
    category: "character",
    colors: ["blue"],
    attributes: [attribute],
    text: "",
  };

  expect(metadata.attributes).toEqual(["?"]);
});
