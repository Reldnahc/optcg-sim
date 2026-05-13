import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import { describe, expect, it } from "vitest";
import type { EffectDefinition, PoneglyphCardDetail } from "@optcg/types";

import { normalizePoneglyphCardDetail } from "./normalization.js";
import type { EffectDefinitionValidationResult } from "./generated-support-index.js";
import { evaluateGeneratedSupportPlayability } from "./support-evaluator.js";

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

describe("support evaluator", () => {
  it("evaluates checked-in OP03-044 Kaya fixture as generated-support playable", () => {
    const normalized = normalizePoneglyphCardDetail(loadOp03044Fixture());

    expect(normalized.cardId).toBe("OP03-044");
    expect(normalized.category).toBe("character");
    expect(normalized.colors).toEqual(["blue"]);
    expect(normalized.cost).toBe(1);
    expect(normalized.power).toBe(0);
    expect(normalized.counter).toBe(2000);
    expect(normalized.types).toEqual(["East Blue"]);
    expect(normalized.triggerText).toBeUndefined();
    expect(normalized.effectText).toBe(
      "[On Play] Draw 2 cards and trash 2 cards from your hand.",
    );

    const evaluation = evaluateGeneratedSupportPlayability({
      card: normalized,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: normalized.behaviorHash,
      expectedSourceTextHash: normalized.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [],
      cardId: "OP03-044",
      effectDefinitionId: "op03-044.generated-support",
      parseStatus: "complete",
      playable: true,
      status: "supported",
      support: {
        cardId: "OP03-044",
        effectDefinitionId: "op03-044.generated-support",
        status: "implemented-dsl",
        tested: true,
      },
    });
    expect(evaluation.effectDefinition).toBeDefined();
    expect(evaluation.capabilityEvidence.length).toBeGreaterThan(0);
  });

  it("returns unsupported with blocker evidence for text that is not fully covered", () => {
    const unsupportedCard = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "OP03-999",
      effect: "[On Play] Draw 1 card. Then rest 1 DON!!.",
      name: "Unsupported Template Candidate",
    });

    const unsupported = evaluateGeneratedSupportPlayability({
      card: unsupportedCard,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: unsupportedCard.behaviorHash,
      expectedSourceTextHash: unsupportedCard.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(unsupported.playable).toBe(false);
    expect(unsupported.status).toBe("unsupported");
    expect(unsupported.parseStatus).toBe("partial");
    expect(unsupported.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unparsed-span" }),
      ]),
    );
    expect(unsupported.effectDefinition).toBeUndefined();
    expect(unsupported.support).toBeUndefined();
  });

  it("fails closed when reviewed source hash evidence is stale", () => {
    const normalized = normalizePoneglyphCardDetail(loadOp03044Fixture());

    const evaluation = evaluateGeneratedSupportPlayability({
      card: normalized,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: normalized.behaviorHash,
      expectedSourceTextHash: "sha256:reviewed-source-before-drift",
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [
        {
          code: "stale-hash",
          expectedHash: "sha256:reviewed-source-before-drift",
          message: "Poneglyph text hash changed.",
          receivedHash: normalized.sourceTextHash,
        },
      ],
      parseStatus: "staleHash",
      playable: false,
      status: "unsupported",
    });
    expect(evaluation.effectDefinition).toBeUndefined();
    expect(evaluation.support).toBeUndefined();
  });

  it("fails closed when reviewed behavior hash evidence is stale", () => {
    const normalized = normalizePoneglyphCardDetail(loadOp03044Fixture());

    const evaluation = evaluateGeneratedSupportPlayability({
      card: normalized,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: "sha256:reviewed-behavior-before-drift",
      expectedSourceTextHash: normalized.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [
        {
          code: "stale-hash",
          expectedHash: "sha256:reviewed-behavior-before-drift",
          message: "Poneglyph behavior hash changed.",
          receivedHash: normalized.behaviorHash,
        },
      ],
      parseStatus: "staleHash",
      playable: false,
      status: "unsupported",
    });
    expect(evaluation.effectDefinition).toBeUndefined();
    expect(evaluation.support).toBeUndefined();
  });

  it("uses normalized raw Poneglyph text as the hash-covered parser source", () => {
    const fixtureWithWhitespace = {
      ...loadOp03044Fixture(),
      effect: "  [On Play] Draw 2 cards and trash 2 cards from your hand.",
      trigger: "  ",
    };
    const normalized = normalizePoneglyphCardDetail(fixtureWithWhitespace);

    const evaluation = evaluateGeneratedSupportPlayability({
      card: normalized,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: normalized.behaviorHash,
      expectedSourceTextHash: normalized.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation.playable).toBe(true);
    expect(evaluation.effectDefinitionId).toBe("op03-044.generated-support");
  });

  it("keeps OP04-014 unsupported unless it satisfies the generated-support contract", () => {
    const op04014 = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "OP04-014",
      effect: "[Banish]",
      name: "Banish Contract Candidate",
    });

    const evaluation = evaluateGeneratedSupportPlayability({
      card: op04014,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: op04014.behaviorHash,
      expectedSourceTextHash: op04014.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation.playable).toBe(false);
    expect(evaluation.status).toBe("unsupported");
    expect(evaluation.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unparsed-span" }),
      ]),
    );
  });

  it("evaluates EB01-017-shaped Blocker reminder text as generated-support playable", () => {
    const blockerCard = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "EB01-017",
      effect:
        "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
      keyword: ["Blocker"],
      name: "Blocker Reminder Candidate",
    });

    const evaluation = evaluateGeneratedSupportPlayability({
      card: blockerCard,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: blockerCard.behaviorHash,
      expectedSourceTextHash: blockerCard.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [],
      cardId: "EB01-017",
      parseStatus: "complete",
      parserRuleIds: ["exact:keyword:blocker:standalone"],
      playable: true,
      status: "supported",
      support: {
        cardId: "EB01-017",
        status: "vanilla-confirmed",
        tested: true,
      },
    });
    expect(evaluation.effectDefinition).toBeUndefined();
    expect(evaluation.effectDefinitionId).toBeUndefined();
  });

  it("rejects Blocker reminder text when normalized card category is not a character", () => {
    const blockerEvent = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "EB01-017",
      card_type: "Event",
      cost: 2,
      effect:
        "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
      keyword: ["Blocker"],
      name: "Malformed Blocker Reminder Candidate",
      power: null,
    });

    const evaluation = evaluateGeneratedSupportPlayability({
      card: blockerEvent,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: blockerEvent.behaviorHash,
      expectedSourceTextHash: blockerEvent.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [
        {
          code: "unsupported-primitive",
          message:
            "Normalized card metadata does not satisfy certified Blocker keyword support preconditions.",
        },
      ],
      parseStatus: "unsupportedPrimitive",
      playable: false,
      status: "unsupported",
    });
  });

  it("evaluates EB01-005-shaped null effect text as playable vanilla-confirmed with no effect definition", () => {
    const vanillaCard = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "EB01-005",
      effect: null,
      keyword: [],
      name: "Empty Effect Candidate",
    });

    const evaluation = evaluateGeneratedSupportPlayability({
      card: vanillaCard,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: vanillaCard.behaviorHash,
      expectedSourceTextHash: vanillaCard.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [],
      cardId: "EB01-005",
      parseStatus: "complete",
      parserRuleIds: [],
      playable: true,
      status: "supported",
      support: {
        cardId: "EB01-005",
        status: "vanilla-confirmed",
        tested: true,
      },
    });
    expect(evaluation.effectDefinition).toBeUndefined();
    expect(evaluation.effectDefinitionId).toBeUndefined();
  });

  it("rejects empty effect text when normalized card category is not a character", () => {
    const emptyEvent = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "EB01-005",
      card_type: "Event",
      cost: 1,
      effect: null,
      keyword: [],
      name: "Malformed Empty Effect Candidate",
      power: null,
    });

    const evaluation = evaluateGeneratedSupportPlayability({
      card: emptyEvent,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: emptyEvent.behaviorHash,
      expectedSourceTextHash: emptyEvent.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [
        {
          code: "unsupported-primitive",
          message:
            "Normalized card metadata does not satisfy certified empty-effect support preconditions.",
        },
      ],
      parseStatus: "unsupportedPrimitive",
      playable: false,
      status: "unsupported",
    });
  });
});

function loadOp03044Fixture(): PoneglyphCardDetail {
  const source = readFileSync(
    path.join(repoRoot, "fixtures/poneglyph/cards/OP03-044.kaya.json"),
    "utf8",
  );

  return JSON.parse(source) as PoneglyphCardDetail;
}
