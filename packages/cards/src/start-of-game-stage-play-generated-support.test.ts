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
import {
  startOfGameStagePlayParserCertificationIds,
  startOfGameStagePlayShapeId,
} from "./start-of-game-stage-play-evidence.js";
import { topNSearchParserCertificationIds } from "./top-n-search-evidence.js";

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

const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-sup-003g",
  rulesVersion: "rules-sup-003g",
  sourceTextHash: "sha256:source",
};

describe("SUP-003G start-of-game Stage play generated support", () => {
  it.each(["Mary Geoise", "Dressrosa"])(
    "supports typed Stage play setup text for %s through real schema validation",
    (typeName) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseCard,
            cardId: `SUP-003G-${typeName.replaceAll(" ", "-")}` as CardId,
            sourceText: `at the start of the game, play up to 1 {${typeName}} type Stage card from your deck.`,
          },
        ],
        parserCertificationEvidence: {
          currentCertificationIds: startOfGameStagePlayParserCertificationIds,
        },
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [],
        componentEvidenceIds: [startOfGameStagePlayShapeId],
        missingCapabilityIds: [],
        parseStatus: "complete",
        parserRuleIds: [
          "exact:start-of-game:play-up-to-1-typed-stage-from-self-deck",
        ],
        status: "supported",
      });
      expect(index.entries[0]?.effectDefinition?.effects[0]).toMatchObject({
        effect: {
          effects: [
            {
              effect: {
                request: {
                  destination: "stageArea",
                  filter: { categories: ["stage"], typesAny: [typeName] },
                  max: 1,
                  min: 0,
                  player: "self",
                  revealTo: "chooserOnly",
                  shuffleAfter: false,
                  zone: "deck",
                },
                type: "search",
              },
            },
            {
              effect: {
                ignoreCost: true,
                selection: "selected:start-of-game",
                type: "playSelected",
              },
            },
          ],
          type: "sequence",
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "startOfGame" },
      });
      expect(validateSchema(index.entries[0]?.effectDefinition)).toBe(true);
      expect(index.entries[0]?.capabilityEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capabilityId: "trigger:startOfGame",
            parserRuleId:
              "exact:start-of-game:play-up-to-1-typed-stage-from-self-deck",
          }),
          expect.objectContaining({
            capabilityId: "playSelected:deck:stage:max1:ignoreCost",
            parserRuleId:
              "exact:start-of-game:play-up-to-1-typed-stage-from-self-deck",
          }),
        ]),
      );
    },
  );

  it("fails closed when parser certification evidence is stale or missing", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "SUP-003G-STALE-CERT" as CardId,
          sourceText:
            "at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.",
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: [],
        staleCertificationIds: ["wrapper:start-of-game"],
      },
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      parseStatus: "complete",
      status: "unsupported",
    });
    expect(
      (index.entries[0]?.blockers ?? []).some(
        (blocker) =>
          blocker.code === "unsupported-primitive" &&
          blocker.message.includes(
            "Stale parser certification wrapper:start-of-game",
          ),
      ),
    ).toBe(true);
  });

  it.each([
    "at the start of the game, play up to 1 {Mary Geoise} type Character card from your deck.",
    "at the start of the game, play up to 1 {Mary Geoise} type Stage card from your hand.",
    "at the start of the game, play 1 {Mary Geoise} type Stage card from your deck.",
  ])("does not promote unsupported partial text %s", (sourceText) => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "SUP-003G-UNSUPPORTED" as CardId,
          sourceText,
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: startOfGameStagePlayParserCertificationIds,
      },
      validateEffectDefinition,
    });

    expect(index.entries[0]?.status).toBe("unsupported");
  });

  it("keeps existing SUP-002 top-N search generated-support rows supported", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "SUP-003G-TOP-N-REGRESSION" as CardId,
          sourceText:
            "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: topNSearchParserCertificationIds,
      },
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      parseStatus: "complete",
      parserRuleIds: [
        "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice",
      ],
      status: "supported",
    });
  });
});
