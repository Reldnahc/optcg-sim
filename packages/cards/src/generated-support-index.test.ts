import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import type {
  CardId,
  EffectDefinition,
  ResolvedCard,
  VariantKey,
} from "@optcg/types";

import {
  buildGeneratedSupportIndex,
  toGeneratedSupportManifestEvidence,
  type EffectDefinitionValidationResult,
} from "./generated-support-index.js";
import { buildMatchCardManifest, validateDecklist } from "./manifest.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const schema = JSON.parse(
  readFileSync(path.join(repoRoot, "contracts/effect-dsl.schema.json"), "utf8"),
) as unknown;
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema as AnySchema);

const validateEffectDefinition = (
  definition: EffectDefinition,
): EffectDefinitionValidationResult => {
  const valid = validateSchema(definition);
  if (valid) {
    return { valid: true };
  }

  return {
    errors: (validateSchema.errors ?? []).map((error) =>
      `${error.instancePath || "/"} ${error.message ?? ""}`.trim(),
    ),
    valid: false,
  };
};

const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  cardId: "CARD-008C-001" as CardId,
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceText: "[On Play] Draw 1 card.",
  sourceTextHash: "sha256:source",
};

describe("generated support index", () => {
  it("creates supported evidence for exact complete-parse card text", () => {
    const index = buildGeneratedSupportIndex({
      cards: [baseCard],
      validateEffectDefinition,
    });

    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: baseCard.cardId,
      effectDefinitionId: "card-008c-001.generated-support",
      parserRuleIds: ["exact:on-play:draw-1:self"],
      sourceTextHash: baseCard.sourceTextHash,
      status: "supported",
      support: {
        cardId: baseCard.cardId,
        effectDefinitionId: "card-008c-001.generated-support",
        status: "implemented-dsl",
        tested: true,
      },
    });
    expect(index.effectDefinitions["card-008c-001.generated-support"]).toEqual(
      index.entries[0]?.effectDefinition,
    );
  });

  it("keeps unparsed residue unsupported with blocker evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          sourceText: "[On Play] Draw 1 card. Then rest 1 DON!!.",
        },
      ],
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Unsupported card text remains after certified parsing.",
        },
      ],
      parserRuleIds: ["exact:on-play:draw-1:self"],
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });

  it("keeps missing runtime capability unsupported", () => {
    const matrixWithoutDraw = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) => capability.id !== "effect:draw:self:count:1",
      ),
    };

    const index = buildGeneratedSupportIndex({
      cards: [baseCard],
      runtimeCapabilityMatrix: matrixWithoutDraw,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId: "effect:draw:self:count:1",
          code: "missing-runtime-capability",
        },
      ],
      missingCapabilityIds: ["effect:draw:self:count:1"],
      status: "unsupported",
    });
  });

  it("keeps invalid generated DSL unsupported when schema validation fails", () => {
    const index = buildGeneratedSupportIndex({
      cards: [baseCard],
      validateEffectDefinition: () => ({
        errors: ["/effects/0/effect/type failed schema validation"],
        valid: false,
      }),
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          code: "invalid-dsl-schema",
          message: "Generated DSL failed effect DSL schema validation.",
        },
      ],
      status: "unsupported",
    });
  });

  it("produces reproducible index output independent of input order", () => {
    const later = {
      ...baseCard,
      cardId: "CARD-008C-002" as CardId,
      sourceTextHash: "sha256:source-2",
    };
    const first = buildGeneratedSupportIndex({
      cards: [later, baseCard],
      validateEffectDefinition,
    });
    const second = buildGeneratedSupportIndex({
      cards: [baseCard, later],
      validateEffectDefinition,
    });

    expect(first).toEqual(second);
    expect(first.entries.map((entry) => entry.cardId)).toEqual([
      "CARD-008C-001",
      "CARD-008C-002",
    ]);
  });

  it("emits generated support evidence that existing deck validation can consume", () => {
    const index = buildGeneratedSupportIndex({
      cards: [baseCard],
      validateEffectDefinition,
    });
    const evidence = toGeneratedSupportManifestEvidence(index);
    const resolvedCard = createResolvedCard(baseCard.cardId, evidence);
    const leader = createVanillaLeader("CARD-008C-L" as CardId);
    const manifest = buildMatchCardManifest({
      cards: [leader, resolvedCard],
      createdAt: "2026-05-12T00:00:00.000Z",
      effectDefinitions: evidence.effectDefinitions,
      source: "manual-test",
      versions: {
        banlistVersion: "banlist-v1",
        cardDataVersion: baseCard.cardDataVersion,
        customHandlerVersion: "handlers-v1",
        effectDefinitionsVersion: baseCard.effectDefinitionsVersion,
        overlayVersion: "overlay-v1",
      },
    });

    const result = validateDecklist({
      deck: [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: baseCard.cardId, quantity: 1 },
      ],
      expectedMainDeckSize: 1,
      format: "standard",
      manifest,
      mode: "ranked",
      overlayVersion: "overlay-v1",
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

function createResolvedCard(
  cardId: CardId,
  evidence: ReturnType<typeof toGeneratedSupportManifestEvidence>,
): ResolvedCard {
  const support = evidence.support[cardId];
  if (support === undefined) {
    throw new Error(`Missing support for ${String(cardId)}.`);
  }

  return {
    attributes: [],
    behaviorHash: support.behaviorHash,
    cardId,
    category: "character",
    colors: ["red"],
    cost: 1,
    errata: [],
    language: "en",
    legality: {
      standard: { max_copies: 4, status: "legal" },
    },
    name: "Generated Support Test Card",
    officialFaq: [],
    power: 1000,
    printedKeywords: [],
    released: true,
    set: "OP",
    setName: "Test Set",
    sourceTextHash: support.sourceTextHash,
    support,
    types: ["Test"],
    variants: [
      {
        variantIndex: 1,
        variantKey: `${String(cardId)}:v1` as VariantKey,
      },
    ],
  };
}

function createVanillaLeader(cardId: CardId): ResolvedCard {
  const behaviorHash = `sha256:behavior:${String(cardId)}`;
  const sourceTextHash = `sha256:source:${String(cardId)}`;

  return {
    attributes: [],
    behaviorHash,
    cardId,
    category: "leader",
    colors: ["red"],
    errata: [],
    language: "en",
    legality: {
      standard: { max_copies: 1, status: "legal" },
    },
    name: "Generated Support Test Leader",
    officialFaq: [],
    printedKeywords: [],
    released: true,
    set: "OP",
    setName: "Test Set",
    sourceTextHash,
    support: {
      behaviorHash,
      cardDataVersion: baseCard.cardDataVersion,
      cardId,
      rulesVersion: baseCard.rulesVersion,
      sourceTextHash,
      status: "vanilla-confirmed",
      tested: true,
    },
    types: ["Test"],
    variants: [
      {
        variantIndex: 1,
        variantKey: `${String(cardId)}:v1` as VariantKey,
      },
    ],
  };
}
