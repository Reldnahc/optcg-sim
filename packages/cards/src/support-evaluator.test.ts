import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import { describe, expect, it } from "vitest";
import type { EffectDefinition, PoneglyphCardDetail } from "@optcg/types";

import { normalizePoneglyphCardDetail } from "./normalization.js";
import type { EffectDefinitionValidationResult } from "./generated-support-index.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";
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

  it("keeps conditional draw unsupported while surfacing decomposition fragments", () => {
    const unsupportedCard = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "CARD-015A-EVAL-CONDITIONAL",
      effect:
        "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand, draw 2 cards.",
      name: "Conditional Draw Unsupported Candidate",
    });

    const evaluation = evaluateGeneratedSupportPlayability({
      card: unsupportedCard,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: unsupportedCard.behaviorHash,
      expectedSourceTextHash: unsupportedCard.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      parseStatus: "partial",
      playable: false,
      status: "unsupported",
    });
    const blocker = evaluation.blockers.find(
      (candidate) => candidate.code === "unparsed-span",
    );
    expect(blocker?.decomposition).toMatchObject({
      recognizedActionCandidates: ["draw 2 cards"],
      recognizedSyntaxFragments: ["if-conditional-wrapper"],
      recognizedTriggerCandidates: ["[On Play]"],
      reason:
        "Conditional wrapper syntax was recognized, but the condition predicates and their conjunction are not certified for this generated-support template; generated support remains fail-closed.",
      unsupportedConditionFragments: [
        "your Leader is multicolored",
        "you have 5 or less cards in your hand",
      ],
      unsupportedSyntaxFragments: ["condition conjunction: and"],
    });
  });

  it("fails closed when runtime capability evidence is missing", () => {
    const normalized = normalizePoneglyphCardDetail(loadOp03044Fixture());
    const runtimeCapabilityMatrix = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) => capability.id !== "effect:sequence:ordered",
      ),
    };

    const evaluation = evaluateGeneratedSupportPlayability({
      card: normalized,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: normalized.behaviorHash,
      expectedSourceTextHash: normalized.sourceTextHash,
      rulesVersion: "generated-support-v1",
      runtimeCapabilityMatrix,
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [
        {
          capabilityId: "effect:sequence:ordered",
          code: "missing-runtime-capability",
          component: "exact:on-play:draw-n:trash-m:hand:self",
        },
      ],
      missingCapabilityIds: ["effect:sequence:ordered"],
      parseStatus: "complete",
      playable: false,
      status: "unsupported",
    });
    expect(evaluation.effectDefinition).toBeUndefined();
    expect(evaluation.support).toBeUndefined();
  });

  it("reports schema failure before runtime-capability failure when both could apply", () => {
    const normalized = normalizePoneglyphCardDetail(loadOp03044Fixture());
    const runtimeCapabilityMatrix = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "effect:sequence:ordered" &&
          capability.id !==
            "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      ),
    };

    const evaluation = evaluateGeneratedSupportPlayability({
      card: normalized,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: normalized.behaviorHash,
      expectedSourceTextHash: normalized.sourceTextHash,
      rulesVersion: "generated-support-v1",
      runtimeCapabilityMatrix,
      validateEffectDefinition: () => ({
        errors: ["/effects/0/effect/type failed schema validation"],
        valid: false,
      }),
    });

    expect(evaluation).toMatchObject({
      blockers: [
        {
          code: "invalid-dsl-schema",
          message: "Generated DSL failed effect DSL schema validation.",
        },
      ],
      missingCapabilityIds: [],
      parseStatus: "complete",
      playable: false,
      status: "unsupported",
    });
  });

  it("fails closed when runtime capability lacks parser-rule evidence", () => {
    const normalized = normalizePoneglyphCardDetail(loadOp03044Fixture());
    const runtimeCapabilityMatrix = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.map(
        (capability) =>
          capability.id === "effect:sequence:ordered"
            ? { ...capability, supportedParserRuleIds: [] }
            : capability,
      ),
    };

    const evaluation = evaluateGeneratedSupportPlayability({
      card: normalized,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: normalized.behaviorHash,
      expectedSourceTextHash: normalized.sourceTextHash,
      rulesVersion: "generated-support-v1",
      runtimeCapabilityMatrix,
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [
        {
          capabilityId: "effect:sequence:ordered",
          code: "missing-runtime-capability",
          component: "exact:on-play:draw-n:trash-m:hand:self",
        },
      ],
      missingCapabilityIds: ["effect:sequence:ordered"],
      parseStatus: "complete",
      playable: false,
      status: "unsupported",
    });
    expect(evaluation.effectDefinition).toBeUndefined();
    expect(evaluation.support).toBeUndefined();
  });

  it("evaluates exact synthetic trash-then-draw text as playable only with segment-0 trash capability evidence", () => {
    const supportedCard = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "CARD-014C-SYNTHETIC",
      effect: "[On Play] Trash 2 cards from your hand. Draw 1 card.",
      name: "Synthetic Trash Then Draw Candidate",
    });
    const missingSegment0TrashMatrix = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "trashFromHand:segment0:self:self:count-exact",
      ),
    };

    const supported = evaluateGeneratedSupportPlayability({
      card: supportedCard,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: supportedCard.behaviorHash,
      expectedSourceTextHash: supportedCard.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });
    const blocked = evaluateGeneratedSupportPlayability({
      card: supportedCard,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: supportedCard.behaviorHash,
      expectedSourceTextHash: supportedCard.sourceTextHash,
      rulesVersion: "generated-support-v1",
      runtimeCapabilityMatrix: missingSegment0TrashMatrix,
      validateEffectDefinition,
    });

    expect(supported).toMatchObject({
      blockers: [],
      cardId: "CARD-014C-SYNTHETIC",
      parseStatus: "complete",
      parserRuleIds: ["exact:on-play:trash-2-from-hand:draw-1:self"],
      playable: true,
      status: "supported",
    });
    expect(supported.capabilityEvidence).toEqual(
      expect.arrayContaining([
        {
          capabilityId: "trashFromHand:segment0:self:self:count-exact",
          parserRuleId: "exact:on-play:trash-2-from-hand:draw-1:self",
        },
      ]),
    );
    expect(blocked).toMatchObject({
      blockers: [
        {
          capabilityId: "trashFromHand:segment0:self:self:count-exact",
          code: "missing-runtime-capability",
          component: "exact:on-play:trash-2-from-hand:draw-1:self",
        },
      ],
      missingCapabilityIds: ["trashFromHand:segment0:self:self:count-exact"],
      parseStatus: "complete",
      playable: false,
      status: "unsupported",
    });
  });

  it("evaluates exact synthetic return-DON play-from-hand text as playable only with playSelected capability evidence", () => {
    const supportedCard = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "CARD-014E-SYNTHETIC",
      effect:
        "[On Play] DON!! -1: Select up to 1 Character card from your hand and play it.",
      name: "Synthetic Return Don Play From Hand Candidate",
    });
    const missingIgnoreCostMatrix = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "playSelected:hand:character:max1:ignoreCost",
      ),
    };

    const supported = evaluateGeneratedSupportPlayability({
      card: supportedCard,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: supportedCard.behaviorHash,
      expectedSourceTextHash: supportedCard.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });
    const blocked = evaluateGeneratedSupportPlayability({
      card: supportedCard,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: supportedCard.behaviorHash,
      expectedSourceTextHash: supportedCard.sourceTextHash,
      rulesVersion: "generated-support-v1",
      runtimeCapabilityMatrix: missingIgnoreCostMatrix,
      validateEffectDefinition,
    });

    expect(supported).toMatchObject({
      blockers: [],
      cardId: "CARD-014E-SYNTHETIC",
      parseStatus: "complete",
      parserRuleIds: [
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
      ],
      playable: true,
      status: "supported",
    });
    expect(supported.capabilityEvidence).toEqual(
      expect.arrayContaining([
        {
          capabilityId: "playSelected:hand:character:max1",
          parserRuleId:
            "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
        },
        {
          capabilityId: "playSelected:hand:character:max1:ignoreCost",
          parserRuleId:
            "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
        },
      ]),
    );
    expect(blocked).toMatchObject({
      blockers: [
        {
          capabilityId: "playSelected:hand:character:max1:ignoreCost",
          code: "missing-runtime-capability",
          component:
            "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
        },
      ],
      missingCapabilityIds: ["playSelected:hand:character:max1:ignoreCost"],
      parseStatus: "complete",
      playable: false,
      status: "unsupported",
    });
  });

  it.each([
    {
      expectedCapabilityId: "optionalEffectBlock:onPlay:draw-1:self",
      expectedRuleId: "exact:on-play:optional-effect:draw-1:self",
      sourceText: "[On Play] You may draw 1 card.",
    },
    {
      expectedCapabilityId: "condition:yourTurn",
      expectedRuleId: "exact:condition:your-turn",
      sourceText: "[On Play] During your turn, draw 1 card.",
    },
    {
      expectedCapabilityId: "condition:selfAttachedDonCount",
      expectedRuleId: "exact:condition:self-attached-don-count",
      sourceText:
        "[On Play] If this Character has 1 or more DON!! cards attached, draw 1 card.",
    },
  ])(
    "evaluates CARD-014F $expectedRuleId text as playable only with matching capability evidence",
    ({ expectedCapabilityId, expectedRuleId, sourceText }) => {
      const supportedCard = normalizePoneglyphCardDetail({
        ...loadOp03044Fixture(),
        card_number: "CARD-014F-SYNTHETIC",
        effect: sourceText,
        name: "Synthetic Optionality Condition Candidate",
      });
      const missingCapabilityMatrix = {
        ...generatedSupportRuntimeCapabilityMatrix,
        capabilities:
          generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
            (capability) => capability.id !== expectedCapabilityId,
          ),
      };

      const supported = evaluateGeneratedSupportPlayability({
        card: supportedCard,
        cardDataVersion: "2026-05-13",
        effectDefinitionsVersion: "generated-support-v1",
        expectedBehaviorHash: supportedCard.behaviorHash,
        expectedSourceTextHash: supportedCard.sourceTextHash,
        rulesVersion: "generated-support-v1",
        validateEffectDefinition,
      });
      const blocked = evaluateGeneratedSupportPlayability({
        card: supportedCard,
        cardDataVersion: "2026-05-13",
        effectDefinitionsVersion: "generated-support-v1",
        expectedBehaviorHash: supportedCard.behaviorHash,
        expectedSourceTextHash: supportedCard.sourceTextHash,
        rulesVersion: "generated-support-v1",
        runtimeCapabilityMatrix: missingCapabilityMatrix,
        validateEffectDefinition,
      });

      expect(supported).toMatchObject({
        blockers: [],
        cardId: "CARD-014F-SYNTHETIC",
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        playable: true,
        status: "supported",
      });
      expect(supported.capabilityEvidence).toEqual(
        expect.arrayContaining([
          {
            capabilityId: expectedCapabilityId,
            parserRuleId: expectedRuleId,
          },
        ]),
      );
      expect(blocked).toMatchObject({
        blockers: [
          {
            capabilityId: expectedCapabilityId,
            code: "missing-runtime-capability",
            component: expectedRuleId,
          },
        ],
        missingCapabilityIds: [expectedCapabilityId],
        parseStatus: "complete",
        playable: false,
        status: "unsupported",
      });
    },
  );

  it.each([
    {
      expectedCapabilityId: "selectTargets:field:public:character:max1",
      expectedRuleId: "exact:on-play:select-1-opponent-character-target",
      sourceText: "[On Play] Select 1 of your opponent's Characters.",
    },
    {
      expectedCapabilityId: "effect:ko:saved-field-object:characterArea:public",
      expectedRuleId:
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
      sourceText:
        "[On Play] Select 1 of your opponent's Characters. Then, K.O. that Character.",
    },
  ])(
    "evaluates CARD-014G $expectedRuleId synthetic text as playable only with matching capability evidence",
    ({ expectedCapabilityId, expectedRuleId, sourceText }) => {
      const supportedCard = normalizePoneglyphCardDetail({
        ...loadOp03044Fixture(),
        card_number: "CARD-014G-SYNTHETIC",
        effect: sourceText,
        name: "Synthetic Target Modifier Restriction Candidate",
      });
      const missingCapabilityMatrix = {
        ...generatedSupportRuntimeCapabilityMatrix,
        capabilities:
          generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
            (capability) => capability.id !== expectedCapabilityId,
          ),
      };

      const supported = evaluateGeneratedSupportPlayability({
        card: supportedCard,
        cardDataVersion: "2026-05-13",
        effectDefinitionsVersion: "generated-support-v1",
        expectedBehaviorHash: supportedCard.behaviorHash,
        expectedSourceTextHash: supportedCard.sourceTextHash,
        rulesVersion: "generated-support-v1",
        validateEffectDefinition,
      });
      const blocked = evaluateGeneratedSupportPlayability({
        card: supportedCard,
        cardDataVersion: "2026-05-13",
        effectDefinitionsVersion: "generated-support-v1",
        expectedBehaviorHash: supportedCard.behaviorHash,
        expectedSourceTextHash: supportedCard.sourceTextHash,
        rulesVersion: "generated-support-v1",
        runtimeCapabilityMatrix: missingCapabilityMatrix,
        validateEffectDefinition,
      });

      expect(supported).toMatchObject({
        blockers: [],
        cardId: "CARD-014G-SYNTHETIC",
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        playable: true,
        status: "supported",
      });
      expect(supported.capabilityEvidence).toEqual(
        expect.arrayContaining([
          {
            capabilityId: expectedCapabilityId,
            parserRuleId: expectedRuleId,
          },
        ]),
      );
      expect(blocked).toMatchObject({
        blockers: [
          {
            capabilityId: expectedCapabilityId,
            code: "missing-runtime-capability",
            component: expectedRuleId,
          },
        ],
        missingCapabilityIds: [expectedCapabilityId],
        parseStatus: "complete",
        playable: false,
        status: "unsupported",
      });
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
    "fails closed CARD-014G $expectedRuleId synthetic text until zero-choice runtime capability exists",
    ({ expectedCapabilityId, expectedRuleId, sourceText }) => {
      const blockedCard = normalizePoneglyphCardDetail({
        ...loadOp03044Fixture(),
        card_number: "CARD-014G-SYNTHETIC",
        effect: sourceText,
        name: "Synthetic Target Modifier Restriction Candidate",
      });

      const blocked = evaluateGeneratedSupportPlayability({
        card: blockedCard,
        cardDataVersion: "2026-05-13",
        effectDefinitionsVersion: "generated-support-v1",
        expectedBehaviorHash: blockedCard.behaviorHash,
        expectedSourceTextHash: blockedCard.sourceTextHash,
        rulesVersion: "generated-support-v1",
        validateEffectDefinition,
      });

      expect(blocked).toMatchObject({
        blockers: [
          {
            capabilityId: expectedCapabilityId,
            code: "missing-runtime-capability",
            component: expectedRuleId,
          },
        ],
        missingCapabilityIds: [expectedCapabilityId],
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        playable: false,
        status: "unsupported",
      });
    },
  );

  it("does not report mutating choose-target support as standalone selectedTargets producer authority", () => {
    const supportedCard = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "CARD-014G-MUTATING-TARGET",
      effect:
        "[On Play] Up to 1 of your opponent's Characters gets -2000 power during this turn.",
      name: "Synthetic Mutating Target Candidate",
    });

    const evaluation = evaluateGeneratedSupportPlayability({
      card: supportedCard,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: supportedCard.behaviorHash,
      expectedSourceTextHash: supportedCard.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [
        {
          capabilityId: "modifyPower:choose:thisTurn:zeroChoiceBranch",
          code: "missing-runtime-capability",
          component: "exact:on-play:modify-power:choose:this-turn",
        },
      ],
      parserRuleIds: ["exact:on-play:modify-power:choose:this-turn"],
      playable: false,
      status: "unsupported",
    });
    expect(evaluation.capabilityEvidence).toEqual(
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

  it.each([
    {
      expectedRuleId: "exact:keyword:rush:standalone",
      fixtureFileName: "OP01-025.roronoa-zoro.json",
      keyword: "rush",
    },
    {
      expectedRuleId: "exact:keyword:banish:standalone",
      fixtureFileName: "OP04-014.monkey-d-luffy.json",
      keyword: "banish",
    },
    {
      expectedRuleId: "exact:keyword:double-attack:standalone",
      fixtureFileName: "P-028.portgas-d-ace.json",
      keyword: "doubleAttack",
    },
  ])(
    "evaluates exact $keyword CARD-013A fixture as generated-support playable",
    ({ expectedRuleId, fixtureFileName }) => {
      const card = normalizePoneglyphCardDetail(loadFixture(fixtureFileName));

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
        cardId: card.cardId,
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        playable: true,
        status: "supported",
        support: {
          cardId: card.cardId,
          status: "vanilla-confirmed",
          tested: true,
        },
      });
      expect(evaluation.effectDefinition).toBeUndefined();
      expect(evaluation.effectDefinitionId).toBeUndefined();
    },
  );

  it("keeps mixed EB04-011 unsupported with only Neptunian residue blockers", () => {
    const card = normalizePoneglyphCardDetail(
      loadFixture("EB04-011.scaled-neptunian.json"),
    );

    const evaluation = evaluateGeneratedSupportPlayability({
      card,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: card.behaviorHash,
      expectedSourceTextHash: card.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation.playable).toBe(false);
    expect(evaluation.status).toBe("unsupported");
    expect(evaluation.parserRuleIds).toEqual([
      "exact:keyword:rush-character:standalone",
    ]);
    const residueBlocker = evaluation.blockers.find(
      (blocker) => blocker.code === "unparsed-span",
    );
    expect(residueBlocker?.span?.text).toBe(
      "[On Play] Draw a card for each of your {Neptunian} type Characters. Then, trash the same number of cards from your hand.",
    );
    expect(JSON.stringify(evaluation.blockers)).not.toContain(
      "[Rush: Character]",
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
  return loadFixture("OP03-044.kaya.json");
}

function loadFixture(fixtureFileName: string): PoneglyphCardDetail {
  const source = readFileSync(
    path.join(repoRoot, "fixtures/poneglyph/cards", fixtureFileName),
    "utf8",
  );

  return JSON.parse(source) as PoneglyphCardDetail;
}
