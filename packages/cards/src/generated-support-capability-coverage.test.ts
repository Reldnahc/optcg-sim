import { describe, expect, it } from "vitest";

import { evaluateRuntimeCapabilityCoverageForParserRuleIds } from "./generated-support-index.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";

describe("generated support capability coverage", () => {
  it("reports CARD-014A missing capabilities as generated-support blockers for future parser rules", () => {
    const coverage = evaluateRuntimeCapabilityCoverageForParserRuleIds({
      parserRuleIds: [
        "exact:on-play:select-1-opponent-character-target",
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
        "exact:on-play:modify-power:self:this-turn",
        "exact:on-play:modify-power:self:this-battle",
        "exact:on-play:modify-power:choose:this-turn",
        "exact:on-play:modify-power:all:this-turn",
        "exact:on-play:cannot-attack:self:this-turn",
        "exact:on-play:cannot-attack:choose:this-turn",
        "exact:on-play:cannot-attack:all:this-turn",
        "exact:on-play:cannot-block:self:this-turn",
        "exact:on-play:cannot-block:choose:this-turn",
        "exact:on-play:cannot-block:all:this-turn",
        "exact:on-play:draw-up-to-n:self",
        "exact:on-play:optional-effect:draw-1:self",
        "exact:condition:your-turn",
        "exact:condition:self-attached-don-count",
      ],
    });

    expect(coverage.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "drawUpTo:self:chooseQuantity",
          component: "on-play-draw-up-to",
          parserRuleId: "exact:on-play:draw-up-to-n:self",
        }),
        expect.objectContaining({
          capabilityId: "optionalEffectBlock:onPlay:draw-1:self",
          component: "on-play-optional-draw",
          parserRuleId: "exact:on-play:optional-effect:draw-1:self",
        }),
        expect.objectContaining({
          capabilityId: "condition:yourTurn",
          component: "on-play-condition-your-turn-draw",
          parserRuleId: "exact:condition:your-turn",
        }),
        expect.objectContaining({
          capabilityId: "condition:selfAttachedDonCount",
          component: "on-play-condition-self-attached-don-count-draw",
          parserRuleId: "exact:condition:self-attached-don-count",
        }),
        expect.objectContaining({
          capabilityId: "selectTargets:field:public:character:max1",
          component: "on-play-select-opponent-character-target",
          parserRuleId: "exact:on-play:select-1-opponent-character-target",
        }),
        expect.objectContaining({
          capabilityId: "savedFieldObject:consumer:generic",
          component: "on-play-select-opponent-character-then-ko",
          parserRuleId:
            "exact:on-play:select-1-opponent-character-then-ko-that-character",
        }),
      ]),
    );
    expect(coverage.missingCapabilityIds).toEqual([
      "cannotAttack:choose:thisTurn:zeroChoiceBranch",
      "cannotBlock:choose:thisTurn:zeroChoiceBranch",
      "modifyPower:choose:thisTurn:zeroChoiceBranch",
    ]);
    expect(coverage.blockers).toEqual(
      coverage.missing.map((missing) => ({
        capabilityId: missing.capabilityId,
        code: "missing-runtime-capability",
        component: missing.component,
        message: `Missing runtime capability ${missing.capabilityId} for component ${missing.component ?? "unknown-component"}.`,
      })),
    );
  });

  it("keeps generated support coverage when parser-rule linkage metadata is removed", () => {
    const matrixWithoutParserRuleLinkage = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.map(
        (capability) =>
          capability.id === "drawUpTo:self:chooseQuantity"
            ? { ...capability, supportedParserRuleIds: [] }
            : capability,
      ),
    };

    const coverage = evaluateRuntimeCapabilityCoverageForParserRuleIds({
      matrix: matrixWithoutParserRuleLinkage,
      parserRuleIds: ["exact:on-play:draw-up-to-n:self"],
    });

    expect(coverage.blockers).toEqual([]);
    expect(coverage.missingCapabilityIds).toEqual([]);
    expect(coverage.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "drawUpTo:self:chooseQuantity",
          component: "on-play-draw-up-to",
          parserRuleId: "exact:on-play:draw-up-to-n:self",
        }),
      ]),
    );
  });

  it("fails closed when capability component linkage is removed even if parser-rule linkage metadata remains", () => {
    const matrixWithoutComponentLinkage = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.map(
        (capability) =>
          capability.id === "drawUpTo:self:chooseQuantity"
            ? { ...capability, supportedComponentIds: [] }
            : capability,
      ),
    };

    const coverage = evaluateRuntimeCapabilityCoverageForParserRuleIds({
      matrix: matrixWithoutComponentLinkage,
      parserRuleIds: ["exact:on-play:draw-up-to-n:self"],
    });

    expect(coverage.blockers).toEqual([
      {
        capabilityId: "drawUpTo:self:chooseQuantity",
        code: "missing-runtime-capability",
        component: "on-play-draw-up-to",
        message:
          "Missing runtime capability drawUpTo:self:chooseQuantity for component on-play-draw-up-to.",
      },
    ]);
    expect(coverage.missingCapabilityIds).toEqual([
      "drawUpTo:self:chooseQuantity",
    ]);
  });

  it("covers supported and unsupported trigger/sourcePresencePolicy combinations", () => {
    const coverage = evaluateRuntimeCapabilityCoverageForParserRuleIds({
      parserRuleIds: [
        "card014a:static:no-source-required",
        "card014a:trigger:resolve-from-destination-zone",
        "card014a:trigger:resolve-from-last-known-information",
        "card014a:unsupported:trigger-activate-main-source-destination",
        "card014a:unsupported:trigger-on-play-no-source",
        "card014a:unsupported:trigger-on-play-source-destination",
        "card014a:unsupported:trigger-on-play-source-lki",
        "card014a:unsupported:trigger-when-attacking-no-source",
      ],
    });

    expect(coverage.evidence).toEqual([]);
    expect(coverage.missingCapabilityIds).toEqual([
      "sourcePresencePolicy:noSourceRequired",
      "sourcePresencePolicy:resolveFromDestinationZone",
      "sourcePresencePolicy:resolveFromLastKnownInformation",
    ]);
  });
});
