import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import { describe, expect, it } from "vitest";
import type {
  CardId,
  EffectDefinition,
  PoneglyphCardDetail,
} from "@optcg/types";

import { normalizePoneglyphCardDetail } from "./normalization.js";
import type { EffectDefinitionValidationResult } from "./generated-support-index.js";
import { evaluateGeneratedSupportPlayability } from "./support-evaluator.js";
import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { activateMainChooseOneCostParserCertificationIds } from "./activate-main-choose-one-cost-evidence.js";

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

describe("activate main choose-one optional cost generated support", () => {
  it.each([
    {
      cardNumber: "SUP-003F-AM-001",
      drawCount: 1,
      effect:
        "[Activate: Main] [Once Per Turn] You may trash 1 of your {Navy} type Characters or 2 cards from your hand: Draw 1 card.",
      fieldTrashCount: 1,
      handTrashCount: 2,
      typeName: "Navy",
    },
    {
      cardNumber: "SUP-003F-AM-002",
      drawCount: 3,
      effect:
        "[Activate: Main] [Once Per Turn] You may trash 2 of your {Fish-Man} type Characters or 1 card from your hand: Draw 3 cards.",
      fieldTrashCount: 2,
      handTrashCount: 1,
      typeName: "Fish-Man",
    },
  ])(
    "supports synthetic row $cardNumber with schema-valid effect DSL",
    ({
      cardNumber,
      drawCount,
      effect,
      fieldTrashCount,
      handTrashCount,
      typeName,
    }) => {
      const card = normalizePoneglyphCardDetail({
        ...loadOp03044Fixture(),
        card_number: cardNumber,
        effect,
        name: cardNumber,
      });

      const evaluation = evaluateGeneratedSupportPlayability({
        card,
        cardDataVersion: "2026-05-21",
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
      expect(evaluation.parserRuleIds).toContain(
        "exact:activate-main:once-per-turn:optional-choose-one-trash-self-field-type-or-hand:draw-n:self",
      );
      expect(evaluation.effectDefinition?.effects[0]).toMatchObject({
        category: "activate",
        oncePerTurn: true,
        trigger: { type: "activateMain" },
      });
      expect(evaluation.effectDefinition?.effects[0]?.effect).toMatchObject({
        effects: [
          {
            effect: {
              cost: {
                options: [
                  {
                    count: fieldTrashCount,
                    filter: {
                      categories: ["character"],
                      typesAny: [typeName],
                    },
                    type: "trashFromField",
                  },
                  {
                    count: handTrashCount,
                    type: "trashFromHand",
                  },
                ],
                type: "chooseOne",
              },
              type: "payCost",
            },
          },
          {
            connector: "ifYouDo",
            effect: { count: drawCount, player: "self", type: "draw" },
          },
        ],
      });
    },
  );

  it.each([
    "trigger-wrapper:activate-main",
    "activate-main-wrapper:once-per-turn",
    "optional-cost-marker:you-may",
    "cost-connector:choose-one-or",
    "cost-alternative:trash-from-field-self-character-type",
    "cost-alternative:trash-from-hand-unfiltered",
    "cost-body-separator:colon",
    "body-action:draw-n",
    "source-presence-policy:must-remain-in-same-zone",
    "composition:activate-main-optional-choose-one-trash-cost-draw",
  ] as const)(
    "fails closed when activate-main primitive certification boundary is missing: %s",
    (missingCertificationId) => {
      const sourceText =
        "[Activate: Main] [Once Per Turn] You may trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards.";
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            behaviorHash: "sha256:behavior",
            cardDataVersion: "cards-v1",
            cardId: "SUP-003F-AM-CERT" as CardId,
            effectDefinitionsVersion: "effects-sup-003f",
            rulesVersion: "rules-sup-003f",
            sourceText,
            sourceTextHash: "sha256:source",
          },
        ],
        parserCertificationEvidence: {
          currentCertificationIds:
            activateMainChooseOneCostParserCertificationIds.filter(
              (id) => id !== missingCertificationId,
            ),
        },
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        parseStatus: "complete",
        status: "unsupported",
      });
      expect(index.entries[0]?.blockers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "unsupported-primitive",
            diagnosticLayer: "review",
          }),
        ]),
      );
      expect(
        index.entries[0]?.blockers.some((blocker) =>
          blocker.message.includes(
            `Missing parser certification ${missingCertificationId}`,
          ),
        ),
      ).toBe(true);
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
