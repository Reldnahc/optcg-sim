import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import { describe, expect, it } from "vitest";
import type { EffectDefinition, PoneglyphCardDetail } from "@optcg/types";

import type { EffectDefinitionValidationResult } from "./generated-support-index.js";
import { normalizePoneglyphCardDetail } from "./normalization.js";
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
  if (valid) return { valid: true };
  return {
    errors: (validateSchema.errors ?? []).map((error) =>
      `${error.instancePath || "/"} ${error.message ?? ""}`.trim(),
    ),
    valid: false,
  };
};

describe("support evaluator parser certification evidence", () => {
  it.each([
    {
      cardNumber: "SUP-002E-EVAL-OPTIONAL-TRASH-KO",
      effect:
        "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 5 or less.",
      expectedParserRuleId:
        "exact:on-play:optional-trash-n-from-hand:ko-up-to-1-opponent-character-base-cost-n-or-less",
      name: "Optional Trash K.O. Candidate",
    },
    {
      cardNumber: "SUP-002F-EVAL-BASE-POWER",
      effect:
        "[Your Turn] If you have 10 or more cards in your trash, set the base power of all of your {Five Elders} type Characters to 7000.",
      expectedParserRuleId:
        "exact:conditional-continuous:condition:base-power:self-character-type:direct",
      name: "Conditional Base Power Candidate",
    },
    {
      cardNumber: "SUP-002G-EVAL-FILTERED-SEARCH",
      effect:
        "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
      expectedParserRuleId:
        "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice",
      name: "Filtered Top-N Search Candidate",
    },
    {
      cardNumber: "SUP-002G-EVAL-RETURN-DON-SEARCH-TRASH",
      effect:
        "[On Play] DON!! −1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
      expectedParserRuleId:
        "exact:on-play:return-don-top-n-search:any-card:hand:bottom-owner-choice:trash-hand",
      name: "Return DON Search Trash Candidate",
    },
  ])(
    "supplies current parser certification evidence for $cardNumber",
    ({ cardNumber, effect, expectedParserRuleId, name }) => {
      const card = normalizePoneglyphCardDetail({
        ...loadOp03044Fixture(),
        card_number: cardNumber,
        effect,
        name,
      });

      const evaluation = evaluateGeneratedSupportPlayability({
        card,
        cardDataVersion: "2026-05-13",
        effectDefinitionsVersion: "generated-support-v1",
        expectedBehaviorHash: card.behaviorHash,
        expectedSourceTextHash: card.sourceTextHash,
        rulesVersion: "generated-support-v1",
        validateEffectDefinition,
      });

      expect(evaluation).toMatchObject({
        blockers: [],
        parseStatus: "complete",
        playable: true,
        status: "supported",
      });
      expect(evaluation.parserRuleIds).toContain(expectedParserRuleId);
    },
  );
});

function loadOp03044Fixture(): PoneglyphCardDetail {
  const source = readFileSync(
    path.join(repoRoot, "fixtures/poneglyph/cards/OP03-044.kaya.json"),
    "utf8",
  );
  return JSON.parse(source) as PoneglyphCardDetail;
}
