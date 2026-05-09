import type {
  CardId,
  DecklistEntry,
  EffectId,
  EffectDefinition,
  MatchCardManifest,
  ResolvedCard,
  VariantKey,
} from "@optcg/types";
import { describe, expect, it } from "vitest";

import {
  buildMatchCardManifest,
  computeMatchCardManifestHash,
  createManifestVersions,
  validateDecklist,
} from "./manifest.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
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
): MatchCardManifest =>
  buildMatchCardManifest({
    cards,
    createdAt: "2026-05-09T00:00:00.000Z",
    effectDefinitions,
    source: "poneglyph-fixture",
    versions: baseVersions,
  });

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
});

describe("deck validation", () => {
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
      [{ cardId: card.cardId, quantity: 1 }],
      buildManifest([card]),
    );
    const sandbox = validateDecklist({
      deck: [{ cardId: card.cardId, quantity: 1 }],
      format: "standard",
      manifest: buildManifest([card]),
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
});
