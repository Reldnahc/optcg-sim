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
        "card014a:unsupported:saved-field-object-as-modifier-target",
        "card014a:unsupported:saved-field-object-as-restriction-target",
        "card014a:unsupported:saved-reference-select-cards-hand-input",
        "card014a:unsupported:saved-reference-play-selected-input",
        "card014a:unsupported:sequence-third-segment-position",
        "card014a:unsupported:sequence-loop",
        "card014a:unsupported:target-opponent-leader",
        "card014a:unsupported:duration-permanent",
        "card014a:unsupported:duration-until-start-next-turn",
        "card014a:unsupported:trigger-activate-main-source-destination",
        "card014a:unsupported:stage-trigger",
        "card014a:unsupported:event-trigger",
        "card014a:unsupported:replacement-damage",
        "card014a:unsupported:refresh-lock",
      ],
    });

    expect(coverage.evidence).toEqual(
      expect.arrayContaining([
        {
          capabilityId: "drawUpTo:self:chooseQuantity",
          parserRuleId: "exact:on-play:draw-up-to-n:self",
        },
        {
          capabilityId: "optionalEffectBlock:onPlay:draw-1:self",
          parserRuleId: "exact:on-play:optional-effect:draw-1:self",
        },
        {
          capabilityId: "condition:yourTurn",
          parserRuleId: "exact:condition:your-turn",
        },
        {
          capabilityId: "condition:selfAttachedDonCount",
          parserRuleId: "exact:condition:self-attached-don-count",
        },
        {
          capabilityId: "selectTargets:field:public:character:max1",
          parserRuleId: "exact:on-play:select-1-opponent-character-target",
        },
        {
          capabilityId: "savedFieldObject:consumer:generic",
          parserRuleId:
            "exact:on-play:select-1-opponent-character-then-ko-that-character",
        },
        {
          capabilityId: "modifyPower:choose:thisTurn",
          parserRuleId: "exact:on-play:modify-power:choose:this-turn",
        },
        {
          capabilityId: "cannotAttack:choose:thisTurn",
          parserRuleId: "exact:on-play:cannot-attack:choose:this-turn",
        },
        {
          capabilityId: "cannotBlock:choose:thisTurn",
          parserRuleId: "exact:on-play:cannot-block:choose:this-turn",
        },
      ]),
    );
    expect(coverage.missingCapabilityIds).toEqual([
      "modifyPower:self:permanent",
      "modifyPower:self:untilStartOfNextTurn",
      "playSelected:savedReference:character:max1",
      "refreshLock:don",
      "replacement:damage",
      "savedFieldObject:consumer:modifierTarget",
      "savedFieldObject:consumer:restrictionTarget",
      "selectCards:hand:savedReference:character:max1",
      "selectTargets:field:public:opponentLeader:max1",
      "sequence:position:segment2",
      "sequence:repeat",
      "sourcePresencePolicy:resolveFromDestinationZone:trigger:activateMain",
      "trigger:event",
      "trigger:stage",
    ]);
    expect(coverage.blockers).toEqual(
      coverage.missing.map((missing) => ({
        capabilityId: missing.capabilityId,
        code: "missing-runtime-capability",
        component: missing.parserRuleId,
        message: `Missing runtime capability ${missing.capabilityId} for parser rule ${missing.parserRuleId}.`,
      })),
    );
  });

  it("blocks generated support when CARD-014A parser-rule capability evidence is removed", () => {
    const matrixWithoutDrawUpTo = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) => capability.id !== "drawUpTo:self:chooseQuantity",
      ),
    };

    const coverage = evaluateRuntimeCapabilityCoverageForParserRuleIds({
      matrix: matrixWithoutDrawUpTo,
      parserRuleIds: ["exact:on-play:draw-up-to-n:self"],
    });

    expect(coverage.blockers).toEqual([
      {
        capabilityId: "drawUpTo:self:chooseQuantity",
        code: "missing-runtime-capability",
        component: "exact:on-play:draw-up-to-n:self",
        message:
          "Missing runtime capability drawUpTo:self:chooseQuantity for parser rule exact:on-play:draw-up-to-n:self.",
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

    expect(coverage.evidence).toEqual(
      expect.arrayContaining([
        {
          capabilityId: "sourcePresencePolicy:noSourceRequired",
          parserRuleId: "card014a:static:no-source-required",
        },
        {
          capabilityId: "sourcePresencePolicy:resolveFromDestinationZone",
          parserRuleId: "card014a:trigger:resolve-from-destination-zone",
        },
        {
          capabilityId: "sourcePresencePolicy:resolveFromLastKnownInformation",
          parserRuleId: "card014a:trigger:resolve-from-last-known-information",
        },
      ]),
    );
    expect(coverage.missingCapabilityIds).toEqual([
      "sourcePresencePolicy:noSourceRequired:trigger:onPlay",
      "sourcePresencePolicy:noSourceRequired:trigger:whenAttacking",
      "sourcePresencePolicy:resolveFromDestinationZone:trigger:activateMain",
      "sourcePresencePolicy:resolveFromDestinationZone:trigger:onPlay",
      "sourcePresencePolicy:resolveFromLastKnownInformation:trigger:onPlay",
    ]);
  });
});
