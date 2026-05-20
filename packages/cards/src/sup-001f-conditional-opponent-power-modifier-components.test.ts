import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CardId, PoneglyphCardDetail } from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";
import { listRequiredRuntimeCapabilityIdsForComponentEvidenceId } from "./generated-support-types.js";
import {
  generatedSupportRuntimeCapabilityMatrix,
  hasRuntimeCapability,
} from "./runtime-capability-matrix.js";
import { runSupportProbe } from "./support-probe.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const validateEffectDefinition = () => ({ valid: true }) as const;
const baseInput = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
};

describe("SUP-001F conditional opponent power modifier card components", () => {
  it.each([
    {
      expectedConditionValue: 6,
      expectedPower: -1000,
      sourceText:
        "[When Attacking] If you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets -1000 power during this turn.",
    },
    {
      expectedConditionValue: 3,
      expectedPower: -3000,
      sourceText:
        "[When Attacking] If you have 3 or less DON!! cards on your field, up to 1 of your opponent's Characters gets -3000 power during this turn.",
    },
    {
      expectedConditionValue: 9,
      expectedPower: -4000,
      sourceText:
        "[When Attacking] If you have 9 or less DON!! cards on your field, up to 1 of your opponent's Characters gets −4000 power during this turn.",
    },
    {
      expectedCondition: {
        filter: { categories: ["don"] },
        op: "gte",
        player: "opponent",
        type: "fieldCount",
        value: 2,
      },
      expectedPower: -2000,
      sourceText:
        "[When Attacking] If your opponent has 2 or more DON!! cards on their field, up to 1 of your opponent's Characters gets -2000 power during this turn.",
    },
  ] as const)(
    "parses supported conditional When Attacking modifier path (%s)",
    ({
      expectedCondition,
      expectedConditionValue,
      expectedPower,
      sourceText,
    }) => {
      const parsed = parseCertifiedCardText({
        cardId: "SUP-001F-SYNTHETIC" as CardId,
        effectDefinitionsVersion: "effects-v1",
        rulesVersion: "rules-v1",
        sourceText,
        sourceTextHash: `sha256:${String(expectedConditionValue)}-${String(expectedPower)}`,
      });

      expect(parsed.status).toBe("complete");
      if (parsed.status !== "complete") {
        throw new Error("Expected SUP-001F parse to be complete.");
      }

      expect(parsed.parserRuleIds).toEqual([
        "condition-component:field-count-don-public",
        "exact:when-attacking:conditional:modify-power:choose:this-turn",
      ]);
      expect(parsed.effectDefinition.effects).toEqual([
        {
          category: "auto",
          condition: expectedCondition ?? {
            filter: { categories: ["don"] },
            op: "lte",
            player: "self",
            type: "fieldCount",
            value: expectedConditionValue,
          },
          effect: {
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
            value: expectedPower,
          },
          id: "SUP-001F-SYNTHETIC:exact:when-attacking:modify-power:choose:this-turn",
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "whenAttacking" },
        },
      ]);
    },
  );

  it("reports parser/runtime evidence for condition, target, modifier, and duration components", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "SUP-001F-EVIDENCE" as CardId,
          sourceText:
            "[When Attacking] If you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets -1000 power during this turn.",
          sourceTextHash: "sha256:sup-001f-evidence",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);

    expect(report.supportedCardIds).toEqual(["SUP-001F-EVIDENCE"]);
    expect(report.statusByCardId["SUP-001F-EVIDENCE"]).toMatchObject({
      componentEvidenceIds: [
        "condition-field-count-don-public",
        "when-attacking-conditional-modify-power-choose-this-turn",
      ],
      parserRuleIds: [
        "condition-component:field-count-don-public",
        "exact:when-attacking:conditional:modify-power:choose:this-turn",
      ],
      status: "supported",
    });
    expect(
      report.proofCertificatesByCardId["SUP-001F-EVIDENCE"]
        ?.requiredRuntimeCapabilityIds,
    ).toEqual(
      expect.arrayContaining([
        "condition:fieldCount:don:public",
        "modifyPower:choose:thisTurn",
        "modifyPower:choose:thisTurn:zeroChoiceBranch",
        "trigger:whenAttacking",
      ]),
    );
  });

  it.each([
    "[When Attacking] If you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets --1000 power during this turn.",
    "[When Attacking] If you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets - 1000 power during this turn.",
    "[When Attacking] If you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets +1000.5 power during this turn.",
  ])("fails closed on malformed power value (%s)", (sourceText) => {
    const parsed = parseCertifiedCardText({
      cardId: "SUP-001F-BAD-POWER" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText,
      sourceTextHash: "sha256:sup-001f-bad-power",
    });

    expect(parsed.status).toBe("partial");
  });

  it.each([
    "[When Attacking] If you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets -1000 power during this battle.",
    "[When Attacking] If you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets -1000 power permanently.",
  ])("fails closed on unsupported duration (%s)", (sourceText) => {
    const parsed = parseCertifiedCardText({
      cardId: "SUP-001F-BAD-DURATION" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText,
      sourceTextHash: "sha256:sup-001f-bad-duration",
    });

    expect(parsed.status).toBe("partial");
  });

  it.each([
    "[When Attacking] If you have 6 or less DON!! cards on your field, up to 1 of your opponent's Leader gets -1000 power during this turn.",
    "[When Attacking] If you have 6 or less DON!! cards on your field, this Character gets -1000 power during this turn.",
  ])("fails closed on unsupported target shape (%s)", (sourceText) => {
    const parsed = parseCertifiedCardText({
      cardId: "SUP-001F-BAD-TARGET" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText,
      sourceTextHash: "sha256:sup-001f-bad-target",
    });

    expect(parsed.status).toBe("partial");
  });

  it("fails closed on unsupported condition shape", () => {
    const parsed = parseCertifiedCardText({
      cardId: "SUP-001F-BAD-CONDITION" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText:
        "[When Attacking] If this Character has 1 or more DON!! cards attached, up to 1 of your opponent's Characters gets -1000 power during this turn.",
      sourceTextHash: "sha256:sup-001f-bad-condition",
    });

    expect(parsed.status).toBe("partial");
  });

  it.each([
    "[When Attacking] If your Leader is multicolored and you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets -1000 power during this turn.",
    "[When Attacking] If your Leader is multicolored or you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets -1000 power during this turn.",
    "[When Attacking] If you have 6 or less DON!! cards on your field and your opponent has 2 or more DON!! cards on their field, up to 1 of your opponent's Characters gets -1000 power during this turn.",
  ])(
    "fails closed when condition is not exactly one public DON field-count predicate (%s)",
    (sourceText) => {
      const parsed = parseCertifiedCardText({
        cardId: "SUP-001F-CONDITION-BOUNDARY" as CardId,
        effectDefinitionsVersion: "effects-v1",
        rulesVersion: "rules-v1",
        sourceText,
        sourceTextHash: "sha256:sup-001f-condition-boundary",
      });

      expect(parsed.status).toBe("partial");

      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId: "SUP-001F-CONDITION-BOUNDARY" as CardId,
            sourceText,
            sourceTextHash: "sha256:sup-001f-condition-boundary",
          },
        ],
        validateEffectDefinition,
      });
      expect(index.entries[0]?.status).toBe("unsupported");
    },
  );

  it("fails closed when runtime capability evidence is missing", () => {
    const matrixWithoutModifyPowerChoose = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "modifyPower:choose:thisTurn" &&
          capability.id !== "modifyPower:choose:thisTurn:zeroChoiceBranch",
      ),
    };
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "SUP-001F-MISSING-CAPABILITY" as CardId,
          sourceText:
            "[When Attacking] If you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets -1000 power during this turn.",
          sourceTextHash: "sha256:sup-001f-missing-capability",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutModifyPowerChoose,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      parseStatus: "complete",
      status: "unsupported",
    });
    expect(index.entries[0]?.missingCapabilityIds).toEqual(
      expect.arrayContaining([
        "modifyPower:choose:thisTurn",
        "modifyPower:choose:thisTurn:zeroChoiceBranch",
      ]),
    );
  });

  it("fails closed on ambiguous mixed condition connectors", () => {
    const parsed = parseCertifiedCardText({
      cardId: "SUP-001F-AMBIGUOUS" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText:
        "[When Attacking] If your Leader is multicolored and you have 6 or less DON!! cards on your field or your opponent has 1 or more Life cards, up to 1 of your opponent's Characters gets -1000 power during this turn.",
      sourceTextHash: "sha256:sup-001f-ambiguous",
    });

    expect(parsed.status).toBe("partial");
  });

  it("preserves CARD-014G On Play modifyPower choose support", () => {
    const parsed = parseCertifiedCardText({
      cardId: "SUP-001F-CARD-014G-REGRESSION" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText:
        "[On Play] Up to 1 of your opponent's Characters gets -2000 power during this turn.",
      sourceTextHash: "sha256:sup-001f-regression-card-014g",
    });

    expect(parsed.status).toBe("complete");
    if (parsed.status !== "complete") {
      throw new Error("Expected CARD-014G regression parse to stay complete.");
    }
    expect(parsed.parserRuleIds).toEqual([
      "exact:on-play:modify-power:choose:this-turn",
    ]);
  });

  it("prints support-probe evidence for conditional target, modifier, and duration candidates", async () => {
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: "SUP-001F-PROBE" as CardId,
      getCard: () =>
        Promise.resolve(
          syntheticCardDetail(
            "SUP-001F-PROBE",
            "[When Attacking] If you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets -1000 power during this turn.",
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
    expect(text).toContain("Playable: yes");
    expect(text).toContain("required runtime capability IDs");
    expect(text).toContain("component evidence IDs");
    expect(text).toContain(
      "when-attacking-conditional-modify-power-choose-this-turn",
    );
    expect(text).toContain("condition-field-count-don-public");
    expect(text).toContain("modifyPower:choose:thisTurn");
    expect(text).toContain("modifyPower:choose:thisTurn:zeroChoiceBranch");
    expect(text).toContain("condition:fieldCount:don:public");
    expect(text).toContain("sourcePresencePolicy:mustRemainInSameZone");
    expect(text).toContain("trigger:whenAttacking");
  });

  it("reuses existing zero-choice capability evidence ids for up-to-one opponent Character targets", () => {
    expect(
      listRequiredRuntimeCapabilityIdsForComponentEvidenceId(
        "when-attacking-conditional-modify-power-choose-this-turn",
      ),
    ).toEqual(
      expect.arrayContaining([
        "modifyPower:choose:thisTurn",
        "modifyPower:choose:thisTurn:zeroChoiceBranch",
      ]),
    );
    expect(hasRuntimeCapability("modifyPower:choose:thisTurn")).toBe(true);
    expect(
      hasRuntimeCapability("modifyPower:choose:thisTurn:zeroChoiceBranch"),
    ).toBe(true);
  });

  it("does not add exact full-card or real-card-specific branches", async () => {
    const productionFiles = [
      "certified-card-text-parser.ts",
      "composed-parser-builder.ts",
      "conditional-generated-support-composer.ts",
      "conditional-parser-components.ts",
      "field-count-don-condition-evidence.ts",
      "generated-support-index.ts",
      "generated-support-types.ts",
      "runtime-capability-matrix.ts",
      "sup-001f-conditional-modify-power-evidence.ts",
    ];
    const productionSource = (
      await Promise.all(
        productionFiles.map((fileName) =>
          readFile(path.join(repoRoot, "packages/cards/src", fileName), "utf8"),
        ),
      )
    ).join("\n");

    expect(productionSource).not.toContain("SUP-001F-PROBE");
    expect(productionSource).not.toContain("SUP-001F-EVIDENCE");
    expect(productionSource).not.toContain(
      "you have 6 or less DON!! cards on your field, up to 1 of your opponent's Characters gets -1000 power during this turn.",
    );
  });
});

function syntheticCardDetail(
  cardId: string,
  effect: string,
): PoneglyphCardDetail {
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
    set_name: "Synthetic SUP-001F Tests",
    trigger: null,
    types: ["Synthetic"],
    variants: [],
  };
}
