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
import { normalizePoneglyphCardDetail } from "./normalization.js";
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
  it("supports checked-in OP03-044 Kaya fixture via certified parser and runtime capability evidence", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(repoRoot, "fixtures/poneglyph/cards/OP03-044.kaya.json"),
        "utf8",
      ),
    ) as unknown;
    const normalized = normalizePoneglyphCardDetail(fixture);
    const sourceText = normalized.effectText ?? "";

    const index = buildGeneratedSupportIndex({
      cards: [
        {
          behaviorHash: normalized.behaviorHash,
          cardDataVersion: "cards-v1",
          cardId: normalized.cardId,
          effectDefinitionsVersion: "effects-v1",
          rulesVersion: "rules-v1",
          sourceText,
          sourceTextHash: normalized.sourceTextHash,
        },
      ],
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: "OP03-044",
      effectDefinitionId: "op03-044.generated-support",
      parseStatus: "complete",
      parserRuleIds: ["exact:on-play:draw-n:trash-m:hand:self"],
      status: "supported",
    });
    expect(index.entries[0]?.capabilityEvidence).toEqual(
      expect.arrayContaining([
        {
          capabilityId: "effect:sequence:ordered",
          parserRuleId: "exact:on-play:draw-n:trash-m:hand:self",
        },
        {
          capabilityId:
            "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
          parserRuleId: "exact:on-play:draw-n:trash-m:hand:self",
        },
      ]),
    );
  });

  it("creates supported evidence for exact complete-parse card text", () => {
    const index = buildGeneratedSupportIndex({
      cards: [baseCard],
      validateEffectDefinition,
    });

    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({
      blockers: [],
      capabilityEvidence: [
        {
          capabilityId: "category:auto",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "effect:draw:self:count:positive-safe-integer",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "sourcePresencePolicy:mustRemainInSameZone",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "trigger:onPlay",
          parserRuleId: "exact:on-play:draw-n:self",
        },
      ],
      cardId: baseCard.cardId,
      effectDefinitionId: "card-008c-001.generated-support",
      parserRuleIds: ["exact:on-play:draw-n:self"],
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
    expect(
      index.effectDefinitions["card-008c-001.generated-support"]?.metadata,
    ).toMatchObject({
      generatedBy: "rule-parser",
      reviewer: "certified-parser-rule:CARD-009B",
      tested: true,
    });
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
      parserRuleIds: ["exact:on-play:draw-n:self"],
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });

  it("keeps missing runtime capability unsupported", () => {
    const matrixWithoutDraw = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "effect:draw:self:count:positive-safe-integer",
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
          capabilityId: "effect:draw:self:count:positive-safe-integer",
          code: "missing-runtime-capability",
        },
      ],
      missingCapabilityIds: ["effect:draw:self:count:positive-safe-integer"],
      status: "unsupported",
    });
  });

  it("keeps parser rules unsupported when capability evidence no longer covers the rule", () => {
    const matrixWithoutRuleEvidence = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.map(
        (capability) =>
          capability.id === "effect:draw:self:count:positive-safe-integer"
            ? { ...capability, supportedParserRuleIds: [] }
            : capability,
      ),
    };

    const index = buildGeneratedSupportIndex({
      cards: [baseCard],
      runtimeCapabilityMatrix: matrixWithoutRuleEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId: "effect:draw:self:count:positive-safe-integer",
          code: "missing-runtime-capability",
          component: "exact:on-play:draw-n:self",
        },
      ],
      missingCapabilityIds: ["effect:draw:self:count:positive-safe-integer"],
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
    expect(evidence.generatedSupport[baseCard.cardId]).toMatchObject({
      capabilityEvidence: [
        {
          capabilityId: "category:auto",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "effect:draw:self:count:positive-safe-integer",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "sourcePresencePolicy:mustRemainInSameZone",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "trigger:onPlay",
          parserRuleId: "exact:on-play:draw-n:self",
        },
      ],
      parseStatus: "complete",
      parserRuleIds: ["exact:on-play:draw-n:self"],
      status: "supported",
    });
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

  it("supports parameterized draw counts for complete parse cards", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-008C-010" as CardId,
          sourceText: "[On Play] Draw 3 cards.",
        },
        {
          ...baseCard,
          cardId: "CARD-008C-011" as CardId,
          sourceText: "[When Attacking] Draw 2 cards.",
        },
      ],
      validateEffectDefinition,
    });

    expect(index.entries.map((entry) => entry.status)).toEqual([
      "supported",
      "supported",
    ]);
    expect(index.entries[0]?.effectDefinition?.effects[0]?.effect).toEqual({
      count: 3,
      player: "self",
      type: "draw",
    });
    expect(index.entries[1]?.effectDefinition?.effects[0]?.effect).toEqual({
      count: 2,
      player: "self",
      type: "draw",
    });
  });

  it.each([
    {
      cardId: "CARD-009B-010" as CardId,
      expectedRuleId: "exact:on-play:draw-n:trash-m:hand:self",
      sourceText: "[On Play] Draw 2 cards and trash 1 card from your hand.",
    },
    {
      cardId: "CARD-009B-011" as CardId,
      expectedRuleId: "exact:when-attacking:draw-n:trash-m:hand:self",
      sourceText:
        "[When Attacking] Draw 3 cards and trash 2 cards from your hand.",
    },
    {
      cardId: "CARD-009B-012" as CardId,
      expectedRuleId:
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      sourceText:
        "[When Attacking] [Once Per Turn] Draw 4 cards and trash 1 card from your hand.",
    },
  ])(
    "supports generated draw-then-trash template parse and capability evidence ($sourceText)",
    ({ cardId, expectedRuleId, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, cardId, sourceText }],
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [],
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        status: "supported",
      });
      expect(index.entries[0]?.capabilityEvidence.length).toBeGreaterThan(0);
    },
  );

  it("supports OP10-045 once-per-turn draw-then-trash template via parser+runtime capability evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "OP10-045" as CardId,
          sourceText:
            "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
        },
      ],
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: "OP10-045",
      parseStatus: "complete",
      parserRuleIds: [
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ],
      status: "supported",
      support: {
        cardId: "OP10-045",
        effectDefinitionId: "op10-045.generated-support",
        status: "implemented-dsl",
        tested: true,
      },
    });
    expect(index.entries[0]?.capabilityEvidence).toEqual(
      expect.arrayContaining([
        {
          capabilityId: "effect:sequence:ordered",
          parserRuleId:
            "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
        },
        {
          capabilityId:
            "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
          parserRuleId:
            "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
        },
        {
          capabilityId: "trigger:whenAttacking:oncePerTurn",
          parserRuleId:
            "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
        },
      ]),
    );
  });

  it.each([
    "[On Play] Trash 1 card from your hand and draw 2 cards.",
    "[When Attacking] Draw 2 cards and trash 1 card from your hand. Then draw 1 card.",
  ])(
    "keeps unsupported draw-then-trash near misses blocked (%s)",
    (sourceText) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, cardId: "CARD-009B-099" as CardId, sourceText }],
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [{ code: "unparsed-span" }],
        parseStatus: "partial",
        status: "unsupported",
      });
    },
  );

  it("keeps draw-then-trash unsupported when runtime sequence capability is missing", () => {
    const matrixWithoutSequence = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) => capability.id !== "effect:sequence:ordered",
      ),
    };
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-009B-100" as CardId,
          sourceText:
            "[When Attacking] Draw 2 cards and trash 1 card from your hand.",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutSequence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId: "effect:sequence:ordered",
          code: "missing-runtime-capability",
          component: "exact:when-attacking:draw-n:trash-m:hand:self",
        },
      ],
      missingCapabilityIds: ["effect:sequence:ordered"],
      parseStatus: "complete",
      parserRuleIds: ["exact:when-attacking:draw-n:trash-m:hand:self"],
      status: "unsupported",
    });
  });

  it("keeps draw-then-trash unsupported when runtime capability lacks parser-rule evidence", () => {
    const matrixWithoutRuleEvidence = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.map(
        (capability) =>
          capability.id === "effect:sequence:ordered"
            ? { ...capability, supportedParserRuleIds: [] }
            : capability,
      ),
    };
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-009B-101" as CardId,
          sourceText: "[On Play] Draw 2 cards and trash 1 card from your hand.",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutRuleEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId: "effect:sequence:ordered",
          code: "missing-runtime-capability",
          component: "exact:on-play:draw-n:trash-m:hand:self",
        },
      ],
      missingCapabilityIds: ["effect:sequence:ordered"],
      parseStatus: "complete",
      parserRuleIds: ["exact:on-play:draw-n:trash-m:hand:self"],
      status: "unsupported",
    });
  });

  it("keeps invalid draw counts unsupported with blocker evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          sourceText: "[On Play] Draw 0 cards.",
        },
      ],
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Card text is not covered by certified parser rules.",
          span: {
            end: 23,
            start: 0,
            text: "[On Play] Draw 0 cards.",
          },
        },
      ],
      parseStatus: "partial",
      parserRuleIds: [],
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
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
