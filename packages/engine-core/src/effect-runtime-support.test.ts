import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardSupportStatus,
  EffectDefinition,
  MatchCardManifest,
  ResolvedCard,
} from "@optcg/types";

import {
  resolveImplementedDslEffectDefinition,
  type EffectDefinitionLookupFailureReason,
} from "./effect-runtime.js";
import {
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectDefinition = (value: EffectDefinition): EffectDefinition => value;

const createManifest = (
  card: ResolvedCard,
  definitionById?: Record<string, EffectDefinition>,
): MatchCardManifest => {
  const manifest: MatchCardManifest = {
    manifestHash: "manifest-effect-runtime",
    source: "manual-test",
    cardDataVersion: "fixture",
    effectDefinitionsVersion: "0.1.0",
    customHandlerVersion: "fixture",
    banlistVersion: "fixture",
    cards: { [card.cardId]: card },
    createdAt: "2026-05-05T00:00:00.000Z",
  };
  if (definitionById !== undefined) {
    manifest.effectDefinitions = definitionById;
  }
  return manifest;
};

const expectLookupFailure = (
  result: ReturnType<typeof resolveImplementedDslEffectDefinition>,
  reason: EffectDefinitionLookupFailureReason,
  supportStatus: CardSupportStatus,
): void => {
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.error.type, "effectRuntimeError");
  assert.equal(result.error.effectId, "effect-definition-lookup");
  assert.deepEqual(result.error.details, {
    reason,
    supportStatus,
  });
};

test("resolves implemented-dsl support to a reviewed On Play draw definition", () => {
  const cardId = toCardId("OP01-015");
  const card = resolvedCard({
    cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "op01-015.v2026-01-16.reviewed.on-play-draw-1",
      rulesVersion: "2026-01-16",
      sourceTextHash: "sha256:test-op01-015",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(cardId, card.support);
  const effectDefinitionId =
    card.support.effectDefinitionId ?? "missing-effect-definition-id";
  const manifest = createManifest(card, { [effectDefinitionId]: definition });

  const result = resolveImplementedDslEffectDefinition(card, manifest);

  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.definition, definition);
});

test("fails when implemented-dsl support omits effect definition id", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-016"),
    category: "character",
    support: { status: "implemented-dsl" },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card),
  );
  expectLookupFailure(
    result,
    "missing-effect-definition-id",
    "implemented-dsl",
  );
});

test("fails when manifest omits the effect definition registry", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-017"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "missing-registry",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card),
  );
  expectLookupFailure(result, "missing-effect-definition", "implemented-dsl");
});

test("fails when effect definition id is missing from manifest registry", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-032"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "missing-definition",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(result, "missing-effect-definition", "implemented-dsl");
});

test("fails when definition card id mismatches support card id", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-018"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-mismatch-card",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(toCardId("OP01-999"), card.support),
    cardId: toCardId("OP01-999"),
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-mismatch-card": definition }),
  );
  expectLookupFailure(result, "definition-card-id-mismatch", "implemented-dsl");
});

test("fails when definition implementation status mismatches support status", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-019"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-status-mismatch",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    implementationStatus: "unsupported",
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-status-mismatch": definition }),
  );
  expectLookupFailure(result, "definition-status-mismatch", "implemented-dsl");
});

test("fails when support cardDataVersion mismatches manifest cardDataVersion", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-020"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-carddata",
      cardDataVersion: "other-version",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(card.cardId, card.support);
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-carddata": definition }),
  );
  expectLookupFailure(
    result,
    "support-card-data-version-mismatch",
    "implemented-dsl",
  );
});

test("fails when support rulesVersion mismatches definition metadata rulesVersion", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-021"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-rules-version",
      rulesVersion: "support-rules",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    metadata: {
      ...reviewedOnPlayDrawDefinition(card.cardId, card.support).metadata,
      rulesVersion: "definition-rules",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-rules-version": definition }),
  );
  expectLookupFailure(result, "rules-version-mismatch", "implemented-dsl");
});

test("fails when support sourceTextHash mismatches definition metadata sourceTextHash", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-022"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-source-hash",
      sourceTextHash: "support-hash",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    metadata: {
      ...reviewedOnPlayDrawDefinition(card.cardId, card.support).metadata,
      sourceTextHash: "definition-hash",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-source-hash": definition }),
  );
  expectLookupFailure(result, "source-text-hash-mismatch", "implemented-dsl");
});

test("fails when definition effectDefinitionsVersion mismatches manifest version", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-023"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-effects-version",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    metadata: {
      ...reviewedOnPlayDrawDefinition(card.cardId, card.support).metadata,
      effectDefinitionsVersion: "other-version",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-effects-version": definition }),
  );
  expectLookupFailure(result, "definition-version-mismatch", "implemented-dsl");
});

test("fails when support metadata is untested", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-024"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-untested-support",
      tested: false,
    },
  });
  const definition = reviewedOnPlayDrawDefinition(card.cardId, card.support);
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-untested-support": definition }),
  );
  expectLookupFailure(result, "untested-support-metadata", "implemented-dsl");
});

test("fails when definition metadata is untested", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-025"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-untested-definition",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    metadata: {
      ...reviewedOnPlayDrawDefinition(card.cardId, card.support).metadata,
      tested: false,
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-untested-definition": definition }),
  );
  expectLookupFailure(
    result,
    "untested-definition-metadata",
    "implemented-dsl",
  );
});

test("fails when definition metadata is unreviewed", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-026"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-unreviewed",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    metadata: {
      sourceTextHash: card.support.sourceTextHash,
      rulesVersion: card.support.rulesVersion,
      effectDefinitionsVersion: "0.1.0",
      tested: true,
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-unreviewed": definition }),
  );
  expectLookupFailure(
    result,
    "unreviewed-definition-metadata",
    "implemented-dsl",
  );
});

test("fails for vanilla cards when support unexpectedly includes an effect definition id", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-027"),
    category: "character",
    support: {
      status: "vanilla-confirmed",
      effectDefinitionId: "unexpected-effect-id",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(
    result,
    "unexpected-vanilla-effect-definition",
    "vanilla-confirmed",
  );
});

test("fails for vanilla cards without DSL support metadata", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-033"),
    category: "character",
    support: {
      status: "vanilla-confirmed",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(
    result,
    "unsupported-support-status",
    "vanilla-confirmed",
  );
});

test("fails for unsupported cards", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-028"),
    category: "character",
    support: { status: "unsupported" },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(result, "unsupported-support-status", "unsupported");
});

test("fails for banned-in-simulator cards", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-029"),
    category: "character",
    support: { status: "banned-in-simulator" },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(
    result,
    "unsupported-support-status",
    "banned-in-simulator",
  );
});

test("fails for implemented-custom cards", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-030"),
    category: "character",
    support: { status: "implemented-custom", customHandlerIds: ["handler-1"] },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(
    result,
    "implemented-custom-status",
    "implemented-custom",
  );
});

test("lookup helper does not mutate manifest or card inputs", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-031"),
    category: "character",
    support: { status: "implemented-dsl", effectDefinitionId: "def-immutable" },
  });
  const definition = reviewedOnPlayDrawDefinition(card.cardId, card.support);
  const manifest = createManifest(card, { "def-immutable": definition });
  const beforeManifest = structuredClone(manifest);
  const beforeCard = structuredClone(card);

  resolveImplementedDslEffectDefinition(card, manifest);

  assert.deepEqual(manifest, beforeManifest);
  assert.deepEqual(card, beforeCard);
});
