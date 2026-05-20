import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CardId, PoneglyphCardDetail } from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import { parseReturnDonCostWrapper } from "./composed-parser-builder.js";
import {
  buildGeneratedSupportIndex,
  type EffectDefinitionValidationResult,
} from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";
import { isCompleteGeneratedSupportParseResult } from "./generated-support-types.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";
import {
  returnDonCostWrapperComponentEvidenceId,
  returnDonCostWrapperParserRuleId,
  returnDonCostWrapperRuntimeCapabilityIds,
} from "./return-don-cost-wrapper-components.js";
import { runSupportProbe } from "./support-probe.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const cardId = "SUP-001C-SYNTHETIC" as CardId;

const validateEffectDefinition = (): EffectDefinitionValidationResult => ({
  valid: true,
});

describe("SUP-001C DON-minus cost wrapper card components", () => {
  it.each([
    {
      expectedCostText: "DON!! -12:",
      sourceText: "DON!! -12: Draw 2 cards.",
    },
    {
      expectedCostText: "DON!! \u221212:",
      sourceText: "DON!! \u221212: Draw 2 cards.",
    },
  ])(
    "parses reusable ASCII and Unicode return-DON cost wrapper components ($expectedCostText)",
    ({ expectedCostText, sourceText }) => {
      expect(parseReturnDonCostWrapper(sourceText)).toEqual({
        bodyText: "Draw 2 cards.",
        componentEvidenceId: returnDonCostWrapperComponentEvidenceId,
        costText: expectedCostText,
        count: 12,
        parserRuleId: returnDonCostWrapperParserRuleId,
        runtimeCapabilityIds: returnDonCostWrapperRuntimeCapabilityIds,
      });
    },
  );

  it.each([
    "DON!! -0: Draw 1 card.",
    "DON!! -01: Draw 1 card.",
    "DON!! -1.5: Draw 1 card.",
    "DON!! -one: Draw 1 card.",
    "DON!! -9007199254740992: Draw 1 card.",
    "DON!! -1 Draw 1 card.",
    "DON!! -1?: Draw 1 card.",
    "You may DON!! -1: Draw 1 card.",
    "Return 1 DON!!: Draw 1 card.",
  ])("fails closed on malformed return-DON cost wrapper %s", (sourceText) => {
    expect(parseReturnDonCostWrapper(sourceText)).toBeUndefined();
  });

  it("reports exact return-DON runtime capability requirements for recognized unsupported wrapped bodies", () => {
    const sourceText = "[On Play] DON!! -2: Rest up to 1 DON!! card.";
    const index = buildGeneratedSupportIndex({
      cards: [baseCard(sourceText)],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);

    expect(index.entries[0]).toMatchObject({
      componentEvidenceIds: [returnDonCostWrapperComponentEvidenceId],
      parseStatus: "partial",
      parserRuleIds: [returnDonCostWrapperParserRuleId],
      status: "unsupported",
    });
    expect(index.entries[0]?.support).toBeUndefined();
    expect(report.proofCertificatesByCardId[cardId]).toMatchObject({
      componentEvidenceIds: [returnDonCostWrapperComponentEvidenceId],
      finalPlayableDecision: "no",
      parserRuleIds: [returnDonCostWrapperParserRuleId],
      requiredRuntimeCapabilityIds: [
        "payCost:returnDon:self:count-exact",
        "returnDon:cost:self:count-exact",
      ],
    });
  });

  it("certifies the reusable wrapper parser rule only on return-DON cost capabilities", () => {
    expect(
      capabilityParserRuleIds("payCost:returnDon:self:count-exact"),
    ).toContain(returnDonCostWrapperParserRuleId);
    expect(
      capabilityParserRuleIds("returnDon:cost:self:count-exact"),
    ).toContain(returnDonCostWrapperParserRuleId);
    expect(
      capabilityParserRuleIds("playSelected:hand:character:max1"),
    ).not.toContain(returnDonCostWrapperParserRuleId);
    expect(
      capabilityParserRuleIds("playSelected:hand:character:max1:ignoreCost"),
    ).not.toContain(returnDonCostWrapperParserRuleId);
    expect(
      capabilityParserRuleIds("selectCards:hand:self:character:max1"),
    ).not.toContain(returnDonCostWrapperParserRuleId);
  });

  it("prints support-probe diagnostics for recognized wrappers without making unsupported bodies playable", async () => {
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId,
      getCard: () =>
        Promise.resolve(
          syntheticCardDetail(
            "[On Play] DON!! \u22123: Rest up to 1 DON!! card.",
          ),
        ),
      stdout: {
        write(chunk: string | Uint8Array): boolean {
          output.push(String(chunk));
          return true;
        },
      },
    });

    const text = output.join("");
    expect(exitCode).toBe(0);
    expect(text).toContain("Playable: no");
    expect(text).toContain(
      "- component evidence IDs: passed (return-don-cost-wrapper)",
    );
    expect(text).toContain(
      "- required runtime capability IDs: passed (payCost:returnDon:self:count-exact, returnDon:cost:self:count-exact)",
    );
    expect(text).toContain("recognized cost candidate: DON!! \u22123:");
    expect(text).toContain(
      "unsupported action blocker: Rest up to 1 DON!! card.",
    );
    expect(text).toContain("- final playable decision: no");
  });

  it("prints narrow diagnostics for non-DON return cost wording without making it playable", async () => {
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId,
      getCard: () =>
        Promise.resolve(
          syntheticCardDetail("[On Play] Return 1 DON!!: Draw 1 card."),
        ),
      stdout: {
        write(chunk: string | Uint8Array): boolean {
          output.push(String(chunk));
          return true;
        },
      },
    });

    const text = output.join("");
    expect(exitCode).toBe(0);
    expect(text).toContain("Playable: no");
    expect(text).toContain("unsupported cost blocker: Return 1 DON!!:");
    expect(text).toContain(
      "unsupported syntax blocker: return-don-cost-wrapper:non-don-wording",
    );
    expect(text).toContain("- final playable decision: no");
  });

  it("preserves existing return-DON play-selected generated support behavior", () => {
    const result = parseCertifiedCardText({
      cardId,
      effectDefinitionsVersion: "generated-support-parser-test",
      rulesVersion: "rules-test",
      sourceText:
        "[On Play] DON!! -2: Select up to 1 Character card from your hand and play it.",
      sourceTextHash: "sha256:source",
    });

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete return-DON play-selected parse.");
    }
    expect(result.parserRuleIds).toEqual([
      "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
    ]);
    expect(result.effectDefinition.effects[0]?.effect).toMatchObject({
      type: "sequence",
    });
    expect(
      result.effectDefinition.effects[0]?.effect.type === "sequence"
        ? result.effectDefinition.effects[0].effect.effects[0]
        : undefined,
    ).toMatchObject({
      effect: {
        cost: { count: 2, optional: true, type: "returnDon" },
        type: "payCost",
      },
    });
  });

  it("does not add real-card ids or exact full-effect branches for the target two-line shape", () => {
    const productionSources = [
      "certified-card-text-parser.ts",
      "composed-parser-builder.ts",
      "generated-support-index.ts",
      "generated-support-report.ts",
      "generated-support-types.ts",
      "runtime-capability-matrix.ts",
    ].map((fileName) => {
      const filePath = path.join(
        repoRoot,
        "packages",
        "cards",
        "src",
        fileName,
      );
      return {
        filePath,
        source: readFileSync(filePath, "utf8"),
      };
    });

    for (const { filePath, source } of productionSources) {
      expect(source, filePath).not.toMatch(/\bOP\d{2}-\d{3}\b/);
      expect(source, filePath).not.toContain(
        "[On Play] DON!! -1: Draw 1 card.",
      );
    }
  });
});

function capabilityParserRuleIds(capabilityId: string): readonly string[] {
  return (
    generatedSupportRuntimeCapabilityMatrix.capabilities.find(
      (capability) => capability.id === capabilityId,
    )?.supportedParserRuleIds ?? []
  );
}

function baseCard(sourceText: string) {
  return {
    behaviorHash: "sha256:behavior",
    cardDataVersion: "cards-v1",
    cardId,
    effectDefinitionsVersion: "effects-v1",
    rulesVersion: "rules-v1",
    sourceText,
    sourceTextHash: "sha256:source",
  };
}

function syntheticCardDetail(effect: string): PoneglyphCardDetail {
  return {
    attribute: ["Special"],
    available_languages: ["en"],
    block: null,
    card_number: cardId,
    card_type: "Character",
    color: ["Red"],
    cost: 3,
    counter: 1000,
    effect,
    language: "en",
    legality: {},
    life: null,
    name: cardId,
    official_faq: [],
    power: 5000,
    rarity: null,
    released: true,
    released_at: null,
    set: "SYNTHETIC",
    set_name: "Synthetic SUP-001C Tests",
    trigger: null,
    types: ["Synthetic"],
    variants: [],
  };
}
