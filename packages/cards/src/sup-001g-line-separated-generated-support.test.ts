import { describe, expect, it } from "vitest";
import type { CardId } from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";

const baseInput = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
};

const validateEffectDefinition = () => ({ valid: true }) as const;

describe("SUP-001G line-separated generated support promotion", () => {
  it("composes DON-minus On Play draw with conditional When Attacking opponent power reduction", () => {
    const sourceText = [
      "[On Play] DON!! -1: Draw 1 card.",
      "[When Attacking] If you have 6 or less DON!! cards on your field, give up to 1 of your opponent's Characters -1000 power during this turn.",
    ].join("\n");

    const parsed = parseCertifiedCardText({
      cardId: "SUP-001G-SYNTHETIC" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText,
      sourceTextHash: "sha256:sup-001g-synthetic",
    });

    expect(parsed.status).toBe("complete");
    if (parsed.status !== "complete") {
      throw new Error("Expected SUP-001G parse to be complete.");
    }

    expect(parsed.parserRuleIds).toEqual([
      "component:cost:return-don:self:count-exact",
      "exact:on-play:draw-n:self",
      "exact:on-play:return-don-draw-n:self",
      "exact:when-attacking:conditional:modify-power:choose:this-turn",
      "line-separated-effect-blocks:v1",
    ]);
    expect(parsed.effectDefinition.effects).toHaveLength(2);
    expect(parsed.effectDefinition.effects[0]).toMatchObject({
      category: "auto",
      cost: { chooser: "self", count: 1, type: "returnDon" },
      effect: { count: 1, player: "self", type: "draw" },
      trigger: { type: "onPlay" },
    });
    expect(parsed.effectDefinition.effects[1]).toMatchObject({
      category: "auto",
      condition: {
        filter: { categories: ["don"] },
        op: "lte",
        player: "self",
        type: "fieldCount",
        value: 6,
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
        value: -1000,
      },
      trigger: { type: "whenAttacking" },
    });
  });

  it("reports SUP-001G line-separated generated support as playable when both lines are supported", () => {
    const sourceText = [
      "[On Play] DON!! -1: Draw 1 card.",
      "[When Attacking] If you have 6 or less DON!! cards on your field, give up to 1 of your opponent's Characters -1000 power during this turn.",
    ].join("\n");
    const report = buildGeneratedSupportReport(
      buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId: "SUP-001G-SYNTHETIC" as CardId,
            sourceText,
            sourceTextHash: "sha256:sup-001g-synthetic",
          },
        ],
        validateEffectDefinition,
      }),
    );

    expect(report.supportedCardIds).toEqual(["SUP-001G-SYNTHETIC"]);
    expect(report.statusByCardId["SUP-001G-SYNTHETIC"]).toMatchObject({
      componentEvidenceIds: [
        "line-separated-effect-blocks-composition",
        "on-play-draw",
        "on-play-return-don-then-draw",
        "return-don-cost-wrapper",
        "when-attacking-conditional-modify-power-choose-this-turn",
      ],
      status: "supported",
    });
    expect(report.blockers).toEqual([]);
    expect(
      report.proofCertificatesByCardId["SUP-001G-SYNTHETIC"]
        ?.requiredRuntimeCapabilityIds,
    ).toEqual(
      expect.arrayContaining([
        "composition:line-separated-effect-blocks:v1",
        "condition:fieldCount:don:public",
        "effect:draw:self:count:positive-safe-integer",
        "modifyPower:choose:thisTurn",
        "payCost:returnDon:self:count-exact",
        "returnDon:cost:self:count-exact",
        "trigger:onPlay",
        "trigger:whenAttacking",
      ]),
    );
  });

  it.each([
    {
      costCount: 2,
      drawCount: 2,
      threshold: 3,
      powerDelta: -2000,
    },
    {
      costCount: 4,
      drawCount: 3,
      threshold: 9,
      powerDelta: -4000,
    },
  ])(
    "uses the same generated-support path when primitive values change (%s)",
    ({ costCount, drawCount, powerDelta, threshold }) => {
      const sourceText = [
        `[On Play] DON!! -${String(costCount)}: Draw ${String(drawCount)} cards.`,
        `[When Attacking] If you have ${String(threshold)} or less DON!! cards on your field, give up to 1 of your opponent's Characters ${String(powerDelta)} power during this turn.`,
      ].join("\n");

      const parsed = parseCertifiedCardText({
        cardId: "SUP-001G-MATRIX" as CardId,
        effectDefinitionsVersion: "effects-v1",
        rulesVersion: "rules-v1",
        sourceText,
        sourceTextHash: `sha256:sup-001g-matrix-${String(costCount)}`,
      });

      expect(parsed.status).toBe("complete");
      if (parsed.status !== "complete") {
        throw new Error("Expected SUP-001G matrix parse to be complete.");
      }
      expect(parsed.parserRuleIds).toEqual([
        "component:cost:return-don:self:count-exact",
        "exact:on-play:draw-n:self",
        "exact:on-play:return-don-draw-n:self",
        "exact:when-attacking:conditional:modify-power:choose:this-turn",
        "line-separated-effect-blocks:v1",
      ]);
      expect(parsed.effectDefinition.effects[0]).toMatchObject({
        cost: { count: costCount },
        effect: { count: drawCount, type: "draw" },
      });
      expect(parsed.effectDefinition.effects[1]).toMatchObject({
        condition: {
          filter: { categories: ["don"] },
          op: "lte",
          player: "self",
          type: "fieldCount",
          value: threshold,
        },
        effect: { type: "modifyPower", value: powerDelta },
      });
    },
  );

  it("keeps line-separated generated support fail-closed when any line is unsupported", () => {
    const sourceText = [
      "[On Play] DON!! -1: Draw 1 card.",
      "[When Attacking] If you and your opponent have 6 or less DON!! cards on your field, give up to 1 of your opponent's Characters -1000 power during this turn.",
    ].join("\n");
    const parsed = parseCertifiedCardText({
      cardId: "SUP-001G-UNSUPPORTED-LINE" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText,
      sourceTextHash: "sha256:sup-001g-unsupported-line",
    });

    expect(parsed.status).toBe("partial");
  });
});
