import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition, EffectId } from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import {
  buildGeneratedSupportIndex,
  type EffectDefinitionValidationResult,
} from "./generated-support-index.js";
import { isCompleteGeneratedSupportParseResult } from "./generated-support-types.js";
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
const cardId = "CARD-014G-SYNTHETIC" as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;

const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  cardId,
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceText: "[On Play] Select 1 of your opponent's Characters.",
  sourceTextHash: "sha256:source",
};

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

const parse = (sourceText: string) =>
  parseCertifiedCardText({
    cardId,
    effectDefinitionsVersion: "generated-support-parser-test",
    rulesVersion: "rules-test",
    sourceText,
    sourceTextHash: "sha256:source",
  });

describe("CARD-014G generated composed support", () => {
  it("parses exact On Play public field target producer text to selectedTargets DSL", () => {
    const result = parse("[On Play] Select 1 of your opponent's Characters.");

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual([
      "exact:on-play:select-1-opponent-character-target",
    ]);
    expect(result.effectDefinition.effects).toEqual([
      {
        category: "auto",
        effect: {
          effects: [
            {
              connector: "always",
              effect: {
                request: {
                  allowFewerIfUnavailable: false,
                  chooser: "self",
                  max: 1,
                  min: 1,
                  player: "opponent",
                  timing: "onResolution",
                  visibility: "public",
                  zone: "characterArea",
                },
                type: "selectTargets",
              },
              id: "selectOpponentCharacter",
              saveResultAs: "selectedTarget",
            },
          ],
          type: "sequence",
        },
        id: toEffectId(
          "CARD-014G-SYNTHETIC:auto-on-play-select-1-opponent-character-target",
        ),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      },
    ]);
  });

  it("parses exact On Play saved field-object KO consumer text to generated DSL", () => {
    const result = parse(
      "[On Play] Select 1 of your opponent's Characters. Then, K.O. that Character.",
    );

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual([
      "exact:on-play:select-1-opponent-character-then-ko-that-character",
    ]);
    expect(result.effectDefinition.effects[0]).toMatchObject({
      category: "auto",
      effect: {
        effects: [
          {
            connector: "always",
            effect: {
              request: {
                allowFewerIfUnavailable: false,
                chooser: "self",
                max: 1,
                min: 1,
                player: "opponent",
                timing: "onResolution",
                visibility: "public",
                zone: "characterArea",
              },
              type: "selectTargets",
            },
            id: "selectOpponentCharacter",
            saveResultAs: "selectedTarget",
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              target: {
                binding: {
                  family: "selectedTargets",
                  objectIndex: 0,
                  saveResultAs: "selectedTarget",
                  sourceSegmentId: "selectOpponentCharacter",
                },
                onFailure: "failClosed",
                player: "opponent",
                type: "savedFieldObject",
                visibility: "publicOnly",
                zone: "characterArea",
              },
              type: "ko",
            },
            id: "koSelectedTarget",
          },
        ],
        type: "sequence",
      },
      id: toEffectId(
        "CARD-014G-SYNTHETIC:auto-on-play-select-1-opponent-character-then-ko",
      ),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    });
  });

  it.each([
    {
      expectedEffect: {
        duration: { type: "thisTurn" },
        target: { type: "self" },
        type: "modifyPower",
        value: 1000,
      },
      expectedParserRuleId: "exact:on-play:modify-power:self:this-turn",
      sourceText: "[On Play] This Character gets +1000 power during this turn.",
    },
    {
      expectedEffect: {
        duration: { type: "thisBattle" },
        target: { type: "self" },
        type: "modifyPower",
        value: 1000,
      },
      expectedParserRuleId: "exact:on-play:modify-power:self:this-battle",
      sourceText:
        "[On Play] This Character gets +1000 power during this battle.",
    },
    {
      expectedEffect: {
        duration: { type: "thisTurn" },
        target: {
          request: {
            allowFewerIfUnavailable: true,
            chooser: "self",
            filter: { categories: ["character"] },
            max: 1,
            min: 0,
            player: "opponent",
            timing: "onResolution",
            visibility: "public",
            zone: "characterArea",
          },
          type: "choose",
        },
        type: "modifyPower",
        value: -2000,
      },
      expectedParserRuleId: "exact:on-play:modify-power:choose:this-turn",
      sourceText:
        "[On Play] Up to 1 of your opponent's Characters gets -2000 power during this turn.",
    },
    {
      expectedEffect: {
        duration: { type: "thisTurn" },
        target: {
          filter: { categories: ["character"] },
          player: "opponent",
          type: "all",
          zone: "characterArea",
        },
        type: "modifyPower",
        value: -2000,
      },
      expectedParserRuleId: "exact:on-play:modify-power:all:this-turn",
      sourceText:
        "[On Play] All of your opponent's Characters get -2000 power during this turn.",
    },
  ])(
    "parses exact supported modifyPower template $expectedParserRuleId",
    ({ expectedEffect, expectedParserRuleId, sourceText }) => {
      const result = parse(sourceText);

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete parse.");
      }

      expect(result.parserRuleIds).toEqual([expectedParserRuleId]);
      expect(result.effectDefinition.effects).toEqual([
        {
          category: "auto",
          effect: expectedEffect,
          id: toEffectId(`CARD-014G-SYNTHETIC:${expectedParserRuleId}`),
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "onPlay" },
        },
      ]);
    },
  );

  it.each([
    {
      expectedEffect: {
        duration: { type: "thisTurn" },
        target: { type: "self" },
        type: "cannotAttack",
      },
      expectedParserRuleId: "exact:on-play:cannot-attack:self:this-turn",
      sourceText: "[On Play] This Character cannot attack during this turn.",
    },
    {
      expectedEffect: {
        duration: { type: "thisTurn" },
        target: {
          request: {
            allowFewerIfUnavailable: true,
            chooser: "self",
            filter: { categories: ["character"] },
            max: 1,
            min: 0,
            player: "opponent",
            timing: "onResolution",
            visibility: "public",
            zone: "characterArea",
          },
          type: "choose",
        },
        type: "cannotAttack",
      },
      expectedParserRuleId: "exact:on-play:cannot-attack:choose:this-turn",
      sourceText:
        "[On Play] Up to 1 of your opponent's Characters cannot attack during this turn.",
    },
    {
      expectedEffect: {
        duration: { type: "thisTurn" },
        target: {
          filter: { categories: ["character"] },
          player: "opponent",
          type: "all",
          zone: "characterArea",
        },
        type: "cannotAttack",
      },
      expectedParserRuleId: "exact:on-play:cannot-attack:all:this-turn",
      sourceText:
        "[On Play] All of your opponent's Characters cannot attack during this turn.",
    },
    {
      expectedEffect: {
        duration: { type: "thisTurn" },
        target: { type: "self" },
        type: "cannotBlock",
      },
      expectedParserRuleId: "exact:on-play:cannot-block:self:this-turn",
      sourceText: "[On Play] This Character cannot block during this turn.",
    },
    {
      expectedEffect: {
        duration: { type: "thisTurn" },
        target: {
          request: {
            allowFewerIfUnavailable: true,
            chooser: "self",
            filter: { categories: ["character"] },
            max: 1,
            min: 0,
            player: "opponent",
            timing: "onResolution",
            visibility: "public",
            zone: "characterArea",
          },
          type: "choose",
        },
        type: "cannotBlock",
      },
      expectedParserRuleId: "exact:on-play:cannot-block:choose:this-turn",
      sourceText:
        "[On Play] Up to 1 of your opponent's Characters cannot block during this turn.",
    },
    {
      expectedEffect: {
        duration: { type: "thisTurn" },
        target: {
          filter: { categories: ["character"] },
          player: "opponent",
          type: "all",
          zone: "characterArea",
        },
        type: "cannotBlock",
      },
      expectedParserRuleId: "exact:on-play:cannot-block:all:this-turn",
      sourceText:
        "[On Play] All of your opponent's Characters cannot block during this turn.",
    },
  ])(
    "parses exact supported restriction template $expectedParserRuleId",
    ({ expectedEffect, expectedParserRuleId, sourceText }) => {
      const result = parse(sourceText);

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete parse.");
      }

      expect(result.parserRuleIds).toEqual([expectedParserRuleId]);
      expect(result.effectDefinition.effects[0]).toMatchObject({
        category: "auto",
        effect: expectedEffect,
        id: toEffectId(`CARD-014G-SYNTHETIC:${expectedParserRuleId}`),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      });
    },
  );

  it.each([
    "[On Play] Select up to 1 Character card from your hand. Then, that Character gets +1000 power during this turn.",
    "[On Play] Select 1 of your opponent's Characters. Then, that Character gets -2000 power during this turn.",
    "[On Play] Select 1 of your opponent's Characters. Then, that Character cannot attack during this turn.",
    "[On Play] Select 1 of your opponent's Characters. Then, that Character cannot block during this turn.",
    "[On Play] This Character gets +1000 power during this action.",
    "[On Play] This Character gets +1000 power while the condition is true.",
    "[On Play] This Character gets +1000 power until the end of this turn.",
    "[On Play] This Character gets +1000 power until the start of your next turn.",
    "[On Play] This Character gets +1000 power while this card is on the field.",
    "[On Play] This Character gets +1000 power permanently.",
    "[On Play] This Character cannot be attacked during this turn.",
    "[On Play] This Character cannot become active during your next Refresh Phase.",
    "[On Play] Up to 2 of your opponent's Characters gets -2000 power during this turn.",
    "[On Play] Up to one of your opponent's Characters gets -2000 power during this turn.",
  ])("fails closed on unsupported CARD-014G wording (%s)", (sourceText) => {
    const result = parse(sourceText);

    expect(result.status).toBe("partial");
    if (isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected unsupported CARD-014G text to fail closed.");
    }
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unparsed-span" }),
      ]),
    );
  });

  it.each([
    {
      expectedCapabilityId: "selectTargets:field:public:character:max1",
      expectedComponent: "on-play-select-opponent-character-target",
      expectedRuleId: "exact:on-play:select-1-opponent-character-target",
      sourceText: "[On Play] Select 1 of your opponent's Characters.",
    },
    {
      expectedCapabilityId: "effect:ko:saved-field-object:characterArea:public",
      expectedComponent: "on-play-select-opponent-character-then-ko",
      expectedRuleId:
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
      sourceText:
        "[On Play] Select 1 of your opponent's Characters. Then, K.O. that Character.",
    },
  ])(
    "supports CARD-014G exact template $expectedRuleId with runtime capability evidence",
    ({
      expectedCapabilityId,
      expectedComponent,
      expectedRuleId,
      sourceText,
    }) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, sourceText }],
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [],
        cardId,
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        status: "supported",
        support: {
          cardId,
          effectDefinitionId: "card-014g-synthetic.generated-support",
          status: "implemented-dsl",
          tested: true,
        },
      });
      expect(index.entries[0]?.capabilityEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capabilityId: expectedCapabilityId,
            component: expectedComponent,
            parserRuleId: expectedRuleId,
          }),
        ]),
      );
    },
  );

  it.each([
    {
      expectedCapabilityId: "modifyPower:choose:thisTurn:zeroChoiceBranch",
      expectedRuleId: "exact:on-play:modify-power:choose:this-turn",
      sourceText:
        "[On Play] Up to 1 of your opponent's Characters gets -2000 power during this turn.",
    },
    {
      expectedCapabilityId: "cannotAttack:choose:thisTurn:zeroChoiceBranch",
      expectedRuleId: "exact:on-play:cannot-attack:choose:this-turn",
      sourceText:
        "[On Play] Up to 1 of your opponent's Characters cannot attack during this turn.",
    },
    {
      expectedCapabilityId: "cannotBlock:choose:thisTurn:zeroChoiceBranch",
      expectedRuleId: "exact:on-play:cannot-block:choose:this-turn",
      sourceText:
        "[On Play] Up to 1 of your opponent's Characters cannot block during this turn.",
    },
  ])(
    "supports CARD-014G exact template $expectedRuleId when zero-choice runtime exists",
    ({ expectedCapabilityId, expectedRuleId, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, sourceText }],
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [],
        missingCapabilityIds: [],
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        status: "supported",
      });
      expect(index.entries[0]?.capabilityEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capabilityId: expectedCapabilityId,
            parserRuleId: expectedRuleId,
          }),
        ]),
      );
      expect(index.effectDefinitions).not.toEqual({});
    },
  );

  it("keeps CARD-014G exact template unsupported when selectTargets capability evidence is missing", () => {
    const matrixWithoutSelectTargets = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "selectTargets:field:public:character:max1",
      ),
    };
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-014G-MISSING-CAPABILITY" as CardId,
          sourceText: "[On Play] Select 1 of your opponent's Characters.",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutSelectTargets,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId: "selectTargets:field:public:character:max1",
          code: "missing-runtime-capability",
          component: "on-play-select-opponent-character-target",
        },
      ],
      missingCapabilityIds: ["selectTargets:field:public:character:max1"],
      parseStatus: "complete",
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });

  it("does not treat a mutating choose-target effect as standalone selectedTargets producer authority", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          sourceText:
            "[On Play] Up to 1 of your opponent's Characters gets -2000 power during this turn.",
        },
      ],
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      parserRuleIds: ["exact:on-play:modify-power:choose:this-turn"],
      status: "supported",
    });
    expect(index.entries[0]?.capabilityEvidence).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          capabilityId: "savedSelectedTargets:producer",
        }),
        expect.objectContaining({
          capabilityId: "selectTargets:field:public:character:max1",
        }),
      ]),
    );
  });
});
