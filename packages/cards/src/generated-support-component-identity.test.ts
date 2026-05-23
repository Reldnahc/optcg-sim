import { describe, expect, it } from "vitest";
import type { CardId } from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import {
  buildGeneratedSupportIndex,
  evaluateRuntimeCapabilityCoverageForComponentEvidenceIds,
  evaluateRuntimeCapabilityCoverageForParserRuleIds,
} from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";
import { generatedSupportComponentEvidenceInventory } from "./generated-support-types.js";

const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  cardId: "CARD-017C-BASE" as CardId,
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceText: "[On Play] Draw 1 card.",
  sourceTextHash: "sha256:source",
};

describe("generated support component identity migration", () => {
  it("requires primitive component evidence IDs for current generated-support inventory entries", () => {
    const currentEntries = generatedSupportComponentEvidenceInventory.filter(
      (entry) => entry.runtimeCapabilityIds.length > 0,
    );
    expect(currentEntries.length).toBeGreaterThan(0);
    expect(
      currentEntries.every(
        (entry) =>
          entry.shapeId.length > 0 &&
          !entry.shapeId.startsWith("exact:") &&
          entry.parserRuleId.length > 0,
      ),
    ).toBe(true);
  });

  it("exposes component evidence IDs on complete and partial parser results", () => {
    const complete = parseCertifiedCardText({
      cardId: "CARD-017C-PARSER-COMPLETE" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText: "[On Play] Draw 1 card.",
      sourceTextHash: "sha256:parser-complete",
    });
    expect(complete).toMatchObject({
      componentEvidenceIds: ["on-play-draw"],
      parserRuleIds: ["exact:on-play:draw-n:self"],
      status: "complete",
    });

    const partial = parseCertifiedCardText({
      cardId: "CARD-017C-PARSER-PARTIAL" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText: "[On Play] Draw 1 card. Then rest 1 DON!!.",
      sourceTextHash: "sha256:parser-partial",
    });
    expect(partial).toMatchObject({
      parsedComponentEvidenceIds: ["on-play-draw"],
      parsedRuleIds: ["exact:on-play:draw-n:self"],
      status: "partial",
    });
  });

  it("uses inventory-backed shape IDs as runtime capability authority, not exact parser IDs", () => {
    for (const entry of generatedSupportComponentEvidenceInventory.filter(
      (candidate) => !("missingRuntimeCapabilityIds" in candidate),
    )) {
      const coverage = evaluateRuntimeCapabilityCoverageForComponentEvidenceIds(
        {
          matrix: generatedSupportRuntimeCapabilityMatrix,
          componentEvidenceIds: [entry.shapeId],
        },
      );
      expect(coverage.missing).toEqual([]);
      expect(coverage.evidence.length).toBeGreaterThan(0);
      expect(
        coverage.evidence.every(
          (evidence) =>
            evidence.component === entry.shapeId &&
            !evidence.component.startsWith("exact:"),
        ),
      ).toBe(true);
    }
  });

  it("fails closed when only legacy parser rule IDs are provided without component mapping authority", () => {
    const coverage = evaluateRuntimeCapabilityCoverageForParserRuleIds({
      parserRuleIds: ["legacy:full-template:id"],
    });
    expect(coverage).toMatchObject({
      blockers: [
        {
          capabilityId: "parser-rule-mapping:legacy:full-template:id",
          code: "missing-runtime-capability",
          component: "legacy:full-template:id",
        },
      ],
      evidence: [],
      missingCapabilityIds: ["parser-rule-mapping:legacy:full-template:id"],
    });

    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-017C-LEGACY-RULE-ONLY" as CardId,
          sourceText:
            "Completely unsupported sentence without certified shape.",
          sourceTextHash: "sha256:legacy-rule-only",
        },
      ],
      validateEffectDefinition: () => ({ valid: true }) as const,
    });
    expect(index.entries[0]).toMatchObject({
      componentEvidenceIds: [],
      parserRuleIds: [],
      status: "unsupported",
    });
  });

  it("fails closed when only exact parser rule IDs are provided, even for known supported templates", () => {
    const parserRuleCoverage =
      evaluateRuntimeCapabilityCoverageForParserRuleIds({
        parserRuleIds: ["exact:on-play:draw-n:self"],
      });
    expect(parserRuleCoverage).toMatchObject({
      blockers: [
        {
          capabilityId: "parser-rule-mapping:exact:on-play:draw-n:self",
          code: "missing-runtime-capability",
          component: "exact:on-play:draw-n:self",
        },
      ],
      evidence: [],
      missingCapabilityIds: ["parser-rule-mapping:exact:on-play:draw-n:self"],
    });

    const primitiveCoverage =
      evaluateRuntimeCapabilityCoverageForComponentEvidenceIds({
        componentEvidenceIds: ["on-play-draw"],
      });
    expect(primitiveCoverage.missingCapabilityIds).toEqual([]);
    expect(
      primitiveCoverage.evidence.some(
        (item) =>
          item.capabilityId === "effect:draw:self:count:positive-safe-integer",
      ),
    ).toBe(true);
  });

  it("propagates component evidence IDs into index/report and avoids inventing IDs for stale-hash or whole-card fallback", () => {
    const validateEffectDefinition = () => ({ valid: true }) as const;

    const supported = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-017C-SUPPORTED" as CardId,
          sourceText: "[On Play] Draw 1 card.",
          sourceTextHash: "sha256:supported",
        },
      ],
      validateEffectDefinition,
    });
    expect(supported.entries[0]).toMatchObject({
      componentEvidenceIds: ["on-play-draw"],
      parserRuleIds: ["exact:on-play:draw-n:self"],
      status: "supported",
    });

    const staleHash = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-017C-STALE" as CardId,
          expectedSourceTextHash: "sha256:old",
          sourceTextHash: "sha256:new",
        },
      ],
      validateEffectDefinition,
    });
    expect(staleHash.entries[0]).toMatchObject({
      componentEvidenceIds: [],
      parseStatus: "staleHash",
      status: "unsupported",
    });

    const wholeCardFallback = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-017C-FALLBACK" as CardId,
          sourceText:
            "Completely unsupported sentence without certified shape.",
          sourceTextHash: "sha256:fallback",
        },
      ],
      validateEffectDefinition,
    });
    expect(wholeCardFallback.entries[0]).toMatchObject({
      componentEvidenceIds: [],
      parserRuleIds: [],
      status: "unsupported",
    });

    const report = buildGeneratedSupportReport(supported);
    expect(report).toMatchObject({
      componentEvidenceIdsUsed: ["on-play-draw"],
      statusByCardId: {
        "CARD-017C-SUPPORTED": {
          componentEvidenceIds: ["on-play-draw"],
          parserRuleIds: ["exact:on-play:draw-n:self"],
        },
      },
    });
  });
});
