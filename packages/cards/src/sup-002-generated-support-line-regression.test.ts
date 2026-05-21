import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition } from "@optcg/types";

import {
  buildGeneratedSupportIndex,
  type EffectDefinitionValidationResult,
} from "./generated-support-index.js";
import { conditionalContinuousCompositionBasePowerParserCertificationIds } from "./conditional-continuous-composition-evidence.js";
import { optionalTrashCostKoParserCertificationIds } from "./optional-trash-cost-ko-evidence.js";
import { topNSearchParserCertificationIds } from "./top-n-search-evidence.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const schema = JSON.parse(
  readFileSync(path.join(repoRoot, "contracts/effect-dsl.schema.json"), "utf8"),
) as AnySchema;
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

const validateEffectDefinition = (
  definition: EffectDefinition,
): EffectDefinitionValidationResult =>
  validateSchema(definition)
    ? { valid: true }
    : {
        errors: (validateSchema.errors ?? []).map((error) =>
          `${error.instancePath || "/"} ${error.message ?? ""}`.trim(),
        ),
        valid: false,
      };

const cardInputBase = {
  behaviorHash: "sha256:sup-002-line-regression-behavior",
  cardDataVersion: "sup-002-line-regression",
  effectDefinitionsVersion: "sup-002-line-regression-effects",
  rulesVersion: "sup-002-line-regression-rules",
  sourceTextHash: "sha256:sup-002-line-regression-source",
};
const parserCertificationIds = [
  ...optionalTrashCostKoParserCertificationIds,
  ...conditionalContinuousCompositionBasePowerParserCertificationIds,
  ...topNSearchParserCertificationIds,
] as const;

describe("SUP-002 generated support representative lines", () => {
  it.each([
    {
      cardId: "SUP-002-LINE-OPTIONAL-TRASH-KO",
      parserRuleIds: [
        "exact:on-play:optional-trash-n-from-hand:ko-up-to-1-opponent-character-base-cost-n-or-less",
      ],
      sourceText:
        "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 5 or less.",
    },
    {
      cardId: "SUP-002-LINE-CONDITIONAL-MINUS-POWER",
      parserRuleIds: [
        "exact:when-attacking:conditional:modify-power:choose:this-turn",
      ],
      sourceText:
        "[When Attacking] If you have 10 or more cards in your trash, give up to 1 of your opponent's Characters −2000 power during this turn.",
    },
    {
      cardId: "SUP-002-LINE-CONDITIONAL-BASE-POWER",
      parserRuleIds: [
        "exact:conditional-continuous:condition:base-power:self-character-type:direct",
      ],
      sourceText:
        "[Your Turn] If you have 10 or more cards in your trash, set the base power of all of your {Five Elders} type Characters to 7000.",
    },
    {
      cardId: "SUP-002-LINE-FILTERED-SEARCH",
      parserRuleIds: [
        "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice",
      ],
      sourceText:
        "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 green {East Blue} type card other than [Nami] and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    },
    {
      cardId: "SUP-002-LINE-RETURN-DON-SEARCH-TRASH",
      parserRuleIds: [
        "component:cost:return-don:self:count-exact",
        "exact:on-play:top-n-search:any-card:up-to-1:hand:bottom-owner-choice",
        "exact:on-play:return-don-top-n-search:any-card:hand:bottom-owner-choice:trash-hand",
      ],
      sourceText:
        "[On Play] DON!! −1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
    },
  ])(
    "marks $cardId supported through parse, schema, and runtime capability gates",
    ({ cardId, parserRuleIds, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...cardInputBase,
            cardId: cardId as CardId,
            sourceText,
            sourceTextHash: `sha256:${cardId.toLowerCase()}`,
          },
        ],
        parserCertificationEvidence: {
          currentCertificationIds: parserCertificationIds,
        },
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [],
        cardId,
        missingCapabilityIds: [],
        parseStatus: "complete",
        parserRuleIds,
        status: "supported",
        support: {
          status: "implemented-dsl",
          tested: true,
        },
      });
      expect(index.effectDefinitions).not.toEqual({});
    },
  );
});
