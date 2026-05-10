import type {
  CardId,
  DecklistEntry,
  EffectId,
  EffectDefinition,
  Loadout,
  MatchCardManifest,
  PlayerId,
  ResolvedCard,
  ResolvedCardOverlay,
  VariantKey,
} from "@optcg/types";
import { describe, expect, it } from "vitest";

import {
  buildMatchCardManifest,
  computeMatchCardManifestHash,
  createManifestVersions,
  deckValidationContractDeferrals,
  validateDecklist,
  validateLoadout,
} from "./manifest.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toVariantKey = (value: string): VariantKey => value as VariantKey;

const baseVersions = createManifestVersions({
  banlistVersion: "banlist-v1",
  cardDataVersion: "cards-v1",
  customHandlerVersion: "handlers-v1",
  effectDefinitionsVersion: "effects-v1",
  overlayVersion: "overlay-v1",
});

const createResolvedCard = (
  cardId: CardId,
  overrides: Partial<ResolvedCard> = {},
): ResolvedCard => {
  const sourceTextHash = overrides.sourceTextHash ?? `source:${String(cardId)}`;
  const behaviorHash = overrides.behaviorHash ?? `behavior:${String(cardId)}`;
  const variantKey = toVariantKey(`${String(cardId)}:v0`);

  return {
    cardId,
    language: "en",
    name: String(cardId),
    category: "character",
    set: "OP",
    setName: "Test Set",
    released: true,
    colors: ["red"],
    attributes: [],
    types: [],
    printedKeywords: [],
    variants: [{ variantKey, variantIndex: 0 }],
    legality: { standard: { status: "legal", max_copies: 4 } },
    officialFaq: [],
    errata: [],
    sourceTextHash,
    behaviorHash,
    support: {
      behaviorHash,
      cardDataVersion: baseVersions.cardDataVersion,
      cardId,
      rulesVersion: "rules-v1",
      sourceTextHash,
      status: "vanilla-confirmed",
      tested: true,
    },
    ...overrides,
  };
};

const createEffectDefinition = (card: ResolvedCard): EffectDefinition => ({
  cardId: card.cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: toEffectId(`${String(card.cardId)}:effect`),
      category: "auto",
      trigger: { type: "onPlay" },
      effect: { type: "draw", count: 1, player: "self" },
    },
  ],
  metadata: {
    effectDefinitionsVersion: baseVersions.effectDefinitionsVersion,
    reviewer: "rules-reviewer",
    rulesVersion: card.support.rulesVersion,
    sourceTextHash: card.sourceTextHash,
    tested: true,
  },
});

const buildManifest = (
  cards: readonly ResolvedCard[],
  effectDefinitions: Record<string, EffectDefinition> = {},
  overlays?: Record<CardId, ResolvedCardOverlay>,
): MatchCardManifest => {
  const input = {
    cards,
    createdAt: "2026-05-09T00:00:00.000Z",
    effectDefinitions,
    source: "poneglyph-fixture",
    versions: baseVersions,
  } satisfies Parameters<typeof buildMatchCardManifest>[0];

  if (overlays === undefined) {
    return buildMatchCardManifest(input);
  }

  return buildMatchCardManifest({ ...input, overlays });
};

const validate = (
  deck: readonly DecklistEntry[],
  manifest: MatchCardManifest,
) =>
  validateDecklist({
    deck,
    format: "standard",
    manifest,
    mode: "ranked",
    overlayVersion: baseVersions.overlayVersion,
  });

const hasError = (
  result: ReturnType<typeof validateDecklist>,
  code: string,
  cardId: CardId,
): boolean =>
  result.errors.some((error) => error.code === code && error.cardId === cardId);

const createLoadout = (
  deck: readonly DecklistEntry[],
  overrides: Partial<Loadout> = {},
): Loadout => ({
  loadoutId: "loadout-1" as Loadout["loadoutId"],
  ownerPlayerId: toPlayerId("player-1"),
  name: "Test Loadout",
  deck: [...deck],
  ...overrides,
});

describe("match card manifest construction", () => {
  it("computes deterministic manifest hashes that exclude createdAt", () => {
    const card = createResolvedCard(toCardId("OP01-001"));
    const first = buildMatchCardManifest({
      cards: [card],
      createdAt: "2026-05-09T00:00:00.000Z",
      source: "poneglyph-fixture",
      versions: baseVersions,
    });
    const second = buildMatchCardManifest({
      cards: [card],
      createdAt: "2027-01-01T00:00:00.000Z",
      source: "poneglyph-fixture",
      versions: baseVersions,
    });
    const changedSupport = buildMatchCardManifest({
      cards: [
        createResolvedCard(toCardId("OP01-001"), {
          support: {
            ...card.support,
            behaviorHash: "behavior:changed",
          },
        }),
      ],
      createdAt: "2026-05-09T00:00:00.000Z",
      source: "poneglyph-fixture",
      versions: baseVersions,
    });

    expect(first.manifestHash).toBe(second.manifestHash);
    expect(first.manifestHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(changedSupport.manifestHash).not.toBe(first.manifestHash);
    expect(computeMatchCardManifestHash(first)).toBe(first.manifestHash);
  });

  it("returns manifest and deck validation version metadata from the helper", () => {
    expect(baseVersions).toEqual({
      banlistVersion: "banlist-v1",
      cardDataVersion: "cards-v1",
      customHandlerVersion: "handlers-v1",
      effectDefinitionsVersion: "effects-v1",
      overlayVersion: "overlay-v1",
    });
  });

  it("includes effectDefinitions in the manifest and hash input", () => {
    const card = createResolvedCard(toCardId("OP01-002"), {
      support: {
        behaviorHash: "behavior:OP01-002",
        cardDataVersion: baseVersions.cardDataVersion,
        cardId: toCardId("OP01-002"),
        effectDefinitionId: "op01-002.draw",
        rulesVersion: "rules-v1",
        sourceTextHash: "source:OP01-002",
        status: "implemented-dsl",
        tested: true,
      },
    });
    const definition = createEffectDefinition(card);
    const manifest = buildManifest([card], { "op01-002.draw": definition });
    const changedDefinition = buildManifest([card], {
      "op01-002.draw": {
        ...definition,
        metadata: {
          ...definition.metadata,
          sourceTextHash: "source:changed",
        },
      },
    });

    expect(manifest.effectDefinitions?.["op01-002.draw"]).toEqual(definition);
    expect(changedDefinition.manifestHash).not.toBe(manifest.manifestHash);
  });

  it("keeps raw Poneglyph detail out of manifest cards", () => {
    const card = {
      ...createResolvedCard(toCardId("OP01-027")),
      raw: { card_number: "OP01-027" },
    } satisfies ResolvedCard & { raw: unknown };

    const manifest = buildManifest([card]);
    const manifestCard = manifest.cards[card.cardId];

    if (manifestCard === undefined) {
      throw new Error("Expected manifest to include OP01-027.");
    }

    expect("raw" in card).toBe(true);
    expect("raw" in manifestCard).toBe(false);
  });

  it("fails closed on duplicate manifest card IDs", () => {
    const cardId = toCardId("OP01-028");
    const first = createResolvedCard(cardId, { name: "First duplicate" });
    const second = createResolvedCard(cardId, { name: "Second duplicate" });

    expect(() => buildManifest([first, second])).toThrow(
      /Duplicate manifest card ID OP01-028/u,
    );
  });
});

describe("deck validation", () => {
  it("rejects empty decks and decks without exactly one leader entry", () => {
    const leader = createResolvedCard(toCardId("OP01-012"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const character = createResolvedCard(toCardId("OP01-013"));
    const secondLeader = createResolvedCard(toCardId("OP01-014"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const manifest = buildManifest([leader, character, secondLeader]);

    const empty = validate([], manifest);
    const noLeader = validate(
      [{ cardId: character.cardId, quantity: 1 }],
      manifest,
    );
    const duplicateLeaderQuantity = validate(
      [{ cardId: leader.cardId, quantity: 2 }],
      manifest,
    );
    const multipleLeaders = validate(
      [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: secondLeader.cardId, quantity: 1 },
      ],
      manifest,
    );

    expect(empty.valid).toBe(false);
    expect(empty.errors).toContainEqual(
      expect.objectContaining({ code: "empty-deck" }),
    );
    expect(noLeader.errors).toContainEqual(
      expect.objectContaining({ code: "missing-leader" }),
    );
    expect(duplicateLeaderQuantity.errors).toContainEqual(
      expect.objectContaining({
        code: "leader-quantity-invalid",
        cardId: leader.cardId,
      }),
    );
    expect(multipleLeaders.errors).toContainEqual(
      expect.objectContaining({ code: "multiple-leaders" }),
    );
  });

  it("enforces requested main deck and DON!! deck sizes from manifest card categories", () => {
    const leader = createResolvedCard(toCardId("OP01-015"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const character = createResolvedCard(toCardId("OP01-016"));
    const don = createResolvedCard(toCardId("DON-001"), {
      category: "don",
      colors: [],
      legality: { standard: { status: "legal", max_copies: 10 } },
    });
    const result = validateDecklist({
      deck: [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: character.cardId, quantity: 4 },
        { cardId: don.cardId, quantity: 9 },
      ],
      expectedDonDeckSize: 10,
      expectedMainDeckSize: 5,
      format: "standard",
      manifest: buildManifest([leader, character, don]),
      mode: "ranked",
      overlayVersion: baseVersions.overlayVersion,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "main-deck-size-invalid" }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "don-deck-size-invalid" }),
    );
  });

  it("rejects main deck cards outside the leader color identity", () => {
    const leader = createResolvedCard(toCardId("OP01-017"), {
      category: "leader",
      colors: ["red"],
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const offColor = createResolvedCard(toCardId("OP01-018"), {
      colors: ["blue"],
    });
    const result = validate(
      [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: offColor.cardId, quantity: 1 },
      ],
      buildManifest([leader, offColor]),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "leader-color-restriction",
        cardId: offColor.cardId,
      }),
    );
  });

  it("rejects unknown card IDs", () => {
    const manifest = buildManifest([createResolvedCard(toCardId("OP01-003"))]);
    const result = validate(
      [{ cardId: toCardId("OP01-999"), quantity: 1 }],
      manifest,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "unknown-card-id", cardId: "OP01-999" }),
    );
  });

  it("rejects unsupported non-vanilla cards outside dev or sandbox modes", () => {
    const leader = createResolvedCard(toCardId("OP01-004L"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const card = createResolvedCard(toCardId("OP01-004"), {
      effectText: "[On Play] Draw 1 card.",
      support: {
        behaviorHash: "behavior:OP01-004",
        cardDataVersion: baseVersions.cardDataVersion,
        cardId: toCardId("OP01-004"),
        rulesVersion: "rules-v1",
        sourceTextHash: "source:OP01-004",
        status: "unsupported",
        tested: false,
      },
    });
    const ranked = validate(
      [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: card.cardId, quantity: 1 },
      ],
      buildManifest([leader, card]),
    );
    const sandbox = validateDecklist({
      deck: [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: card.cardId, quantity: 1 },
      ],
      format: "standard",
      manifest: buildManifest([leader, card]),
      mode: "dev-sandbox",
      overlayVersion: baseVersions.overlayVersion,
    });

    expect(ranked.valid).toBe(false);
    expect(ranked.errors).toContainEqual(
      expect.objectContaining({
        code: "unsupported-card",
        cardId: card.cardId,
      }),
    );
    expect(sandbox.valid).toBe(true);
    expect(sandbox.warnings).toContainEqual(
      expect.objectContaining({
        code: "unsupported-card",
        cardId: card.cardId,
      }),
    );
  });

  it("rejects unreleased or format-illegal cards", () => {
    const unreleased = createResolvedCard(toCardId("OP01-005"), {
      released: false,
    });
    const illegal = createResolvedCard(toCardId("OP01-006"), {
      legality: { standard: { status: "banned", max_copies: 0 } },
    });
    const manifest = buildManifest([unreleased, illegal]);
    const result = validate(
      [
        { cardId: unreleased.cardId, quantity: 1 },
        { cardId: illegal.cardId, quantity: 1 },
      ],
      manifest,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "unreleased-card",
        cardId: unreleased.cardId,
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "format-illegal-card",
        cardId: illegal.cardId,
      }),
    );
  });

  it("rejects stale behavior hashes and simulator-banned cards", () => {
    const stale = createResolvedCard(toCardId("OP01-007"), {
      behaviorHash: "behavior:current",
      support: {
        behaviorHash: "behavior:previous",
        cardDataVersion: baseVersions.cardDataVersion,
        cardId: toCardId("OP01-007"),
        rulesVersion: "rules-v1",
        sourceTextHash: "source:OP01-007",
        status: "vanilla-confirmed",
        tested: true,
      },
    });
    const banned = createResolvedCard(toCardId("OP01-008"), {
      support: {
        behaviorHash: "behavior:OP01-008",
        cardDataVersion: baseVersions.cardDataVersion,
        cardId: toCardId("OP01-008"),
        rulesVersion: "rules-v1",
        sourceTextHash: "source:OP01-008",
        status: "banned-in-simulator",
        tested: false,
      },
    });
    const result = validate(
      [
        { cardId: stale.cardId, quantity: 1 },
        { cardId: banned.cardId, quantity: 1 },
      ],
      buildManifest([stale, banned]),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "stale-behavior-hash",
        cardId: stale.cardId,
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "simulator-banned-card",
        cardId: banned.cardId,
      }),
    );
  });

  it("rejects invalid variants and over-copy-limit entries", () => {
    const card = createResolvedCard(toCardId("OP01-009"), {
      legality: { standard: { status: "legal", max_copies: 2 } },
    });
    const result = validate(
      [
        {
          cardId: card.cardId,
          quantity: 2,
          variantKey: toVariantKey("OP01-009:v99"),
        },
        { cardId: card.cardId, quantity: 1 },
      ],
      buildManifest([card]),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "invalid-variant", cardId: card.cardId }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "copy-limit-exceeded",
        cardId: card.cardId,
      }),
    );
  });

  it("accepts valid supported fixture decks and returns resolved cards plus version metadata", () => {
    const leader = createResolvedCard(toCardId("OP01-010"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const character = createResolvedCard(toCardId("OP01-011"));
    const manifest = buildManifest([leader, character]);
    const result = validate(
      [
        { cardId: leader.cardId, quantity: 1 },
        {
          cardId: character.cardId,
          quantity: 4,
          variantKey: toVariantKey("OP01-011:v0"),
        },
      ],
      manifest,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.resolvedCards.map((entry) => entry.cardId)).toEqual([
      leader.cardId,
      character.cardId,
    ]);
    expect(result.resolvedCards[1]).toMatchObject({
      quantity: 4,
      resolvedCard: character,
      variants: ["OP01-011:v0"],
    });
    expect(result.versions).toEqual({
      banlistVersion: baseVersions.banlistVersion,
      cardDataVersion: baseVersions.cardDataVersion,
      effectDefinitionsVersion: baseVersions.effectDefinitionsVersion,
      overlayVersion: baseVersions.overlayVersion,
    });
  });

  it("fails closed for ranked implemented-custom cards without a reviewed contract signal", () => {
    const leader = createResolvedCard(toCardId("OP01-019"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const custom = createResolvedCard(toCardId("OP01-020"), {
      effectText: "[On Play] Draw 1 card.",
      support: {
        behaviorHash: "behavior:OP01-020",
        cardDataVersion: baseVersions.cardDataVersion,
        cardId: toCardId("OP01-020"),
        customHandlerIds: ["op01-020.custom"],
        rulesVersion: "rules-v1",
        sourceTextHash: "source:OP01-020",
        status: "implemented-custom",
        tested: true,
      },
    });
    const result = validate(
      [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: custom.cardId, quantity: 1 },
      ],
      buildManifest([leader, custom]),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "ranked-custom-review-unsupported",
        cardId: custom.cardId,
      }),
    );
  });

  it("rejects cards banned by adopted overlay banlist records", () => {
    const leader = createResolvedCard(toCardId("OP01-029"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const card = createResolvedCard(toCardId("OP01-030"));
    const manifest = buildManifest(
      [leader, card],
      {},
      {
        [card.cardId]: {
          banlist: [
            {
              cardId: card.cardId,
              effectiveFrom: "2026-05-09",
              format: "standard",
              reason: "Simulator safety hold",
              status: "simulatorBanned",
            },
          ],
          cardId: card.cardId,
          support: card.support,
        },
      },
    );
    const result = validate(
      [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: card.cardId, quantity: 1 },
      ],
      manifest,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "simulator-banned-card",
        cardId: card.cardId,
      }),
    );
  });

  it("does not let overlay legal loosen a Poneglyph-banned card", () => {
    const leader = createResolvedCard(toCardId("OP01-038"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const card = createResolvedCard(toCardId("OP01-031"), {
      legality: { standard: { status: "banned", max_copies: 0 } },
    });
    const manifest = buildManifest(
      [leader, card],
      {},
      {
        [card.cardId]: {
          banlist: [
            {
              cardId: card.cardId,
              effectiveFrom: "2026-05-09",
              format: "standard",
              status: "legal",
            },
          ],
          cardId: card.cardId,
          support: card.support,
        },
      },
    );

    expect(manifest.cards[card.cardId]?.legality["standard"]?.status).toBe(
      "banned",
    );
    const result = validate(
      [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: card.cardId, quantity: 1 },
      ],
      manifest,
    );

    expect(result.valid).toBe(false);
    expect(hasError(result, "format-illegal-card", card.cardId)).toBe(true);
  });

  it("does not let overlay legal loosen a Poneglyph not_legal card", () => {
    const leader = createResolvedCard(toCardId("OP01-039"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const card = createResolvedCard(toCardId("OP01-032"), {
      legality: { standard: { status: "not_legal" } },
    });
    const manifest = buildManifest(
      [leader, card],
      {},
      {
        [card.cardId]: {
          banlist: [
            {
              cardId: card.cardId,
              effectiveFrom: "2026-05-09",
              format: "standard",
              status: "legal",
            },
          ],
          cardId: card.cardId,
          support: card.support,
        },
      },
    );

    expect(manifest.cards[card.cardId]?.legality["standard"]?.status).toBe(
      "not_legal",
    );
    const result = validate(
      [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: card.cardId, quantity: 1 },
      ],
      manifest,
    );

    expect(result.valid).toBe(false);
    expect(hasError(result, "format-illegal-card", card.cardId)).toBe(true);
  });

  it("does not let overlay restricted loosen a Poneglyph-banned card", () => {
    const leader = createResolvedCard(toCardId("OP01-033"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const card = createResolvedCard(toCardId("OP01-034"), {
      legality: { standard: { status: "banned", max_copies: 0 } },
    });
    const manifest = buildManifest(
      [leader, card],
      {},
      {
        [card.cardId]: {
          banlist: [
            {
              cardId: card.cardId,
              effectiveFrom: "2026-05-09",
              format: "standard",
              maxCopies: 1,
              status: "restricted",
            },
          ],
          cardId: card.cardId,
          support: card.support,
        },
      },
    );
    const manifestCard = manifest.cards[card.cardId];

    expect(manifestCard?.legality["standard"]?.status).toBe("banned");
    const result = validate(
      [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: card.cardId, quantity: 1 },
      ],
      manifest,
    );

    expect(result.valid).toBe(false);
    expect(hasError(result, "format-illegal-card", card.cardId)).toBe(true);
  });

  it("does not let overlay maxCopies raise a canonical lower copy limit", () => {
    const leader = createResolvedCard(toCardId("OP01-035"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const card = createResolvedCard(toCardId("OP01-036"), {
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const manifest = buildManifest(
      [leader, card],
      {},
      {
        [card.cardId]: {
          banlist: [
            {
              cardId: card.cardId,
              effectiveFrom: "2026-05-09",
              format: "standard",
              maxCopies: 4,
              status: "restricted",
            },
          ],
          cardId: card.cardId,
          support: card.support,
        },
      },
    );

    expect(manifest.cards[card.cardId]?.legality["standard"]?.max_copies).toBe(
      1,
    );
    const result = validate(
      [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: card.cardId, quantity: 2 },
      ],
      manifest,
    );

    expect(result.valid).toBe(false);
    expect(hasError(result, "copy-limit-exceeded", card.cardId)).toBe(true);
  });

  it("fails closed on overlay leaderLocked banlist records without validation semantics", () => {
    const card = createResolvedCard(toCardId("OP01-037"));

    expect(() =>
      buildManifest(
        [card],
        {},
        {
          [card.cardId]: {
            banlist: [
              {
                cardId: card.cardId,
                effectiveFrom: "2026-05-09",
                format: "standard",
                status: "leaderLocked",
              },
            ],
            cardId: card.cardId,
            support: card.support,
          },
        },
      ),
    ).toThrow(/leaderLocked.*validation semantics/u);
  });
});

describe("loadout validation", () => {
  it("rejects cardVariants for unknown cards or invalid variant keys", () => {
    const leader = createResolvedCard(toCardId("OP01-021"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const character = createResolvedCard(toCardId("OP01-022"));
    const result = validateLoadout({
      format: "standard",
      loadout: createLoadout(
        [
          { cardId: leader.cardId, quantity: 1 },
          { cardId: character.cardId, quantity: 1 },
        ],
        {
          cardVariants: {
            [character.cardId]: toVariantKey("OP01-022:v99"),
            [toCardId("OP01-999")]: toVariantKey("OP01-999:v0"),
          },
        },
      ),
      manifest: buildManifest([leader, character]),
      mode: "ranked",
      overlayVersion: baseVersions.overlayVersion,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "invalid-loadout-card-variant",
        cardId: character.cardId,
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "unknown-loadout-card-variant",
        cardId: "OP01-999",
      }),
    );
  });

  it("validates DON!! deck variants when DON!! metadata exists in the manifest", () => {
    const leader = createResolvedCard(toCardId("OP01-023"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const character = createResolvedCard(toCardId("OP01-024"));
    const don = createResolvedCard(toCardId("DON-002"), {
      category: "don",
      colors: [],
      legality: { standard: { status: "legal", max_copies: 10 } },
    });
    const result = validateLoadout({
      format: "standard",
      loadout: createLoadout(
        [
          { cardId: leader.cardId, quantity: 1 },
          { cardId: character.cardId, quantity: 1 },
        ],
        { donDeckVariantKey: toVariantKey("DON-002:v99") },
      ),
      manifest: buildManifest([leader, character, don]),
      mode: "ranked",
      overlayVersion: baseVersions.overlayVersion,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "invalid-don-deck-variant" }),
    );
  });

  it("records a narrow DON!! deck variant deferral when manifest DON!! metadata is absent", () => {
    const leader = createResolvedCard(toCardId("OP01-025"), {
      category: "leader",
      legality: { standard: { status: "legal", max_copies: 1 } },
    });
    const character = createResolvedCard(toCardId("OP01-026"));
    const result = validateLoadout({
      format: "standard",
      loadout: createLoadout(
        [
          { cardId: leader.cardId, quantity: 1 },
          { cardId: character.cardId, quantity: 1 },
        ],
        { donDeckVariantKey: toVariantKey("DON-003:v0") },
      ),
      manifest: buildManifest([leader, character]),
      mode: "ranked",
      overlayVersion: baseVersions.overlayVersion,
    });

    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "don-deck-variant-validation-deferred",
        message: deckValidationContractDeferrals.donDeckVariantKey,
      }),
    );
  });
});
