import { expect, test } from "vitest";

import type {
  Attribute,
  BattleStep,
  CausalityRef,
  CardCategory,
  CardColor,
  CardImplementationRecord,
  CardId,
  CardMetadata,
  CardRef,
  CardSnapshot,
  CardSupportStatus,
  Comparator,
  DeckValidationResult,
  DecklistEntry,
  EngineEvent,
  EngineEventType,
  EffectId,
  EventVisibility,
  Keyword,
  Loadout,
  MatchCardManifest,
  MatchSource,
  MatchId,
  PoneglyphCardDetail,
  PoneglyphVariant,
  PlayerId,
  PlayerRef,
  QueueEntryId,
  ResolvedCard,
  EngineEventId,
  VariantKey,
  StateSeq,
  Visibility,
  ZoneRef,
  Zone,
} from "./index.js";

test("types package entrypoint is importable in the shared Vitest baseline", async () => {
  const moduleNamespace = await import("./index.js");

  expect(Object.keys(moduleNamespace)).toEqual([]);
});

test("branded identifiers reject incompatible assignment at compile time", () => {
  const cardId = "OP01-001" as CardId;
  const playerId = "player-1" as PlayerId;
  const effectId = "effect-1" as EffectId;
  const matchId = "match-1" as MatchId;
  const stateSeq = 1 as StateSeq;

  const sameCardId: CardId = cardId;
  const samePlayerId: PlayerId = playerId;
  const sameEffectId: EffectId = effectId;
  const sameMatchId: MatchId = matchId;
  const sameStateSeq: StateSeq = stateSeq;

  expect(sameCardId).toBe(cardId);
  expect(samePlayerId).toBe(playerId);
  expect(sameEffectId).toBe(effectId);
  expect(sameMatchId).toBe(matchId);
  expect(sameStateSeq).toBe(stateSeq);

  // @ts-expect-error CardId must not be assignable to PlayerId.
  const invalidPlayerId: PlayerId = cardId;
  // @ts-expect-error PlayerId must not be assignable to CardId.
  const invalidCardId: CardId = playerId;
  // @ts-expect-error EffectId must not be assignable to MatchId.
  const invalidMatchId: MatchId = effectId;

  void invalidPlayerId;
  void invalidCardId;
  void invalidMatchId;
});

test("global scalar and reference primitives compile with representative values", () => {
  const zone: Zone = "hand";
  const visibility: Visibility = "bothPlayers";
  const comparator: Comparator = "gte";
  const playerRef: PlayerRef = "opponent";
  const battleStep: BattleStep = "counter";

  expect(zone).toBe("hand");
  expect(visibility).toBe("bothPlayers");
  expect(comparator).toBe("gte");
  expect(playerRef).toBe("opponent");
  expect(battleStep).toBe("counter");
});

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
  const keyword: Keyword = "rush";
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

test("event visibility variants compile for canonical union", () => {
  const publicVisibility: EventVisibility = { type: "public" };
  const privateVisibility: EventVisibility = {
    type: "private",
    playerId: "player-1" as PlayerId,
  };
  const hiddenVisibility: EventVisibility = { type: "hidden" };
  const replayOnlyVisibility: EventVisibility = { type: "replayOnly" };
  const serverOnlyVisibility: EventVisibility = { type: "serverOnly" };

  expect(publicVisibility.type).toBe("public");
  expect(privateVisibility.type).toBe("private");
  expect(hiddenVisibility.type).toBe("hidden");
  expect(replayOnlyVisibility.type).toBe("replayOnly");
  expect(serverOnlyVisibility.type).toBe("serverOnly");
});

test("engine event compiles with causality ref and no out-of-scope contracts", () => {
  const eventType: EngineEventType = "cardMoved";
  const causedBy: CausalityRef = {
    type: "effect",
    queueEntryId: "queue-1" as QueueEntryId,
    effectId: "effect-1" as EffectId,
  };
  const event: EngineEvent = {
    id: "event-1" as EngineEventId,
    seq: 1,
    type: eventType,
    payload: { from: "hand", to: "trash" },
    visibility: { type: "public" },
    createdAtStateSeq: 1 as StateSeq,
    causedBy,
  };

  expect(event.type).toBe("cardMoved");
  expect(event.causedBy?.type).toBe("effect");
});
