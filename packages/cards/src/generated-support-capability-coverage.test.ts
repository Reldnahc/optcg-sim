import { describe, expect, it } from "vitest";

import {
  evaluateRuntimeCapabilityCoverageForComponentEvidenceIds,
  evaluateRuntimeCapabilityCoverageForParserRuleIds,
} from "./generated-support-index.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";

describe("generated support capability coverage", () => {
  it("reports CARD-014A capability coverage for CARD-018A-enabled component evidence", () => {
    const coverage = evaluateRuntimeCapabilityCoverageForComponentEvidenceIds({
      componentEvidenceIds: [
        "on-play-select-opponent-character-target",
        "on-play-select-opponent-character-then-ko",
        "on-play-modify-power-self-this-turn",
        "on-play-modify-power-self-this-battle",
        "on-play-modify-power-choose-this-turn",
        "on-play-modify-power-all-this-turn",
        "on-play-cannot-attack-self-this-turn",
        "on-play-cannot-attack-choose-this-turn",
        "on-play-cannot-attack-all-this-turn",
        "on-play-cannot-block-self-this-turn",
        "on-play-cannot-block-choose-this-turn",
        "on-play-cannot-block-all-this-turn",
        "on-play-draw-up-to",
        "on-play-optional-draw",
        "on-play-condition-your-turn-draw",
        "on-play-condition-self-attached-don-count-draw",
      ],
    });

    expect(coverage.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "drawUpTo:self:chooseQuantity",
          component: "on-play-draw-up-to",
        }),
        expect.objectContaining({
          capabilityId: "optionalEffectBlock:onPlay:draw-n:self",
          component: "on-play-optional-draw",
        }),
        expect.objectContaining({
          capabilityId: "condition:yourTurn",
          component: "on-play-condition-your-turn-draw",
        }),
        expect.objectContaining({
          capabilityId: "condition:selfAttachedDonCount",
          component: "on-play-condition-self-attached-don-count-draw",
        }),
        expect.objectContaining({
          capabilityId: "selectTargets:field:public:character:max1",
          component: "on-play-select-opponent-character-target",
        }),
        expect.objectContaining({
          capabilityId: "savedFieldObject:consumer:generic",
          component: "on-play-select-opponent-character-then-ko",
        }),
      ]),
    );
    expect(coverage.missingCapabilityIds).toEqual([]);
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

    const coverage = evaluateRuntimeCapabilityCoverageForComponentEvidenceIds({
      matrix: matrixWithoutParserRuleLinkage,
      componentEvidenceIds: ["on-play-draw-up-to"],
    });

    expect(coverage.blockers).toEqual([]);
    expect(coverage.missingCapabilityIds).toEqual([]);
    expect(coverage.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "drawUpTo:self:chooseQuantity",
          component: "on-play-draw-up-to",
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

    const coverage = evaluateRuntimeCapabilityCoverageForComponentEvidenceIds({
      matrix: matrixWithoutComponentLinkage,
      componentEvidenceIds: ["on-play-draw-up-to"],
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
      "parser-rule-mapping:card014a:static:no-source-required",
      "parser-rule-mapping:card014a:trigger:resolve-from-destination-zone",
      "parser-rule-mapping:card014a:trigger:resolve-from-last-known-information",
      "parser-rule-mapping:card014a:unsupported:trigger-activate-main-source-destination",
      "parser-rule-mapping:card014a:unsupported:trigger-on-play-no-source",
      "parser-rule-mapping:card014a:unsupported:trigger-on-play-source-destination",
      "parser-rule-mapping:card014a:unsupported:trigger-on-play-source-lki",
      "parser-rule-mapping:card014a:unsupported:trigger-when-attacking-no-source",
    ]);
  });

  it("fails closed when component evidence IDs are missing from inventory", () => {
    const coverage = evaluateRuntimeCapabilityCoverageForComponentEvidenceIds({
      componentEvidenceIds: ["unknown-component-evidence-id"],
    });
    expect(coverage).toMatchObject({
      blockers: [
        {
          capabilityId:
            "component-evidence-inventory:unknown-component-evidence-id",
          code: "missing-runtime-capability",
          component: "unknown-component-evidence-id",
        },
      ],
      missingCapabilityIds: [
        "component-evidence-inventory:unknown-component-evidence-id",
      ],
    });
  });

  it("treats parserRuleIds as trace-only and never as runtime capability authority", () => {
    const parserOnlyCoverage =
      evaluateRuntimeCapabilityCoverageForParserRuleIds({
        parserRuleIds: ["exact:on-play:draw-up-to-n:self"],
      });
    expect(parserOnlyCoverage).toMatchObject({
      blockers: [
        {
          capabilityId: "parser-rule-mapping:exact:on-play:draw-up-to-n:self",
          code: "missing-runtime-capability",
          component: "exact:on-play:draw-up-to-n:self",
        },
      ],
      evidence: [],
      missingCapabilityIds: [
        "parser-rule-mapping:exact:on-play:draw-up-to-n:self",
      ],
    });

    const componentCoverage =
      evaluateRuntimeCapabilityCoverageForComponentEvidenceIds({
        componentEvidenceIds: ["on-play-draw-up-to"],
      });
    expect(componentCoverage.missingCapabilityIds).toEqual([]);
    expect(
      componentCoverage.evidence.some(
        (item) => item.capabilityId === "drawUpTo:self:chooseQuantity",
      ),
    ).toBe(true);
  });
});
