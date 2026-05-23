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

describe("support evaluator default parser certification", () => {
  it("keeps synthetic non-base conditional continuous keyword support playable with default parser certification evidence", () => {
    const conditionalContinuousCard = normalizePoneglyphCardDetail({
      ...syntheticCardDetail(),
      card_number: "CARD-025E-EVAL-CONDITIONAL-CONTINUOUS",
      effect:
        "If you have 7 or more cards in your trash, this Character gains [Rush].",
      name: "Conditional Continuous Rush Candidate",
    });

    const evaluation = evaluateGeneratedSupportPlayability({
      card: conditionalContinuousCard,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: conditionalContinuousCard.behaviorHash,
      expectedSourceTextHash: conditionalContinuousCard.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [],
      parseStatus: "complete",
      parserRuleIds: [
        "exact:conditional-continuous:condition:body-part-composition:self-character:direct:keyword",
      ],
      playable: true,
      status: "supported",
    });
    expect(evaluation.capabilityEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "condition:trashCount",
          component: "condition-expression",
        }),
        expect.objectContaining({
          capabilityId: "effect:giveKeyword:self:permanent:allowlisted",
          parserRuleId:
            "exact:conditional-continuous:condition:body-part-composition:self-character:direct:keyword",
        }),
      ]),
    );
  });
});

function syntheticCardDetail(): PoneglyphCardDetail {
  return {
    attribute: ["Special"],
    available_languages: ["en"],
    block: null,
    card_number: "CARD-025E-SYNTHETIC-BASE",
    card_type: "Character",
    color: ["Blue"],
    cost: 3,
    counter: 1000,
    effect: null,
    language: "en",
    legality: {},
    life: null,
    name: "CARD-025E Synthetic Base",
    official_faq: [],
    power: 5000,
    rarity: null,
    released: true,
    released_at: null,
    set: "SYNTHETIC",
    set_name: "Synthetic CARD-025E Tests",
    trigger: null,
    types: ["Synthetic"],
    variants: [],
  };
}
