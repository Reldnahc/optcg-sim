import { describe, expect, it } from "vitest";
import type { CardId } from "@optcg/types";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";
import { normalizePoneglyphCardDetail } from "./normalization.js";
import { listRepresentativeSupportProofMatrixRows } from "./representative-fixtures.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";

const baseInput = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
};

const validateEffectDefinition = () => ({ valid: true }) as const;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

describe("generated support report", () => {
  it("includes OP03-044 Kaya as supported with certified parser and capability evidence", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(repoRoot, "fixtures/poneglyph/cards/OP03-044.kaya.json"),
        "utf8",
      ),
    ) as unknown;
    const normalized = normalizePoneglyphCardDetail(fixture);

    const index = buildGeneratedSupportIndex({
      cards: [
        {
          behaviorHash: normalized.behaviorHash,
          cardDataVersion: "cards-v1",
          cardId: normalized.cardId,
          effectDefinitionsVersion: "effects-v1",
          rulesVersion: "rules-v1",
          sourceText: normalized.effectText ?? "",
          sourceTextHash: normalized.sourceTextHash,
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);

    expect(report.supportedCardIds).toEqual(["OP03-044"]);
    expect(report.unsupportedCardIds).toEqual([]);
    expect(report.statusByCardId["OP03-044"]).toEqual({
      blockerCodes: [],
      missingCapabilityIds: [],
      parseStatus: "complete",
      parserRuleIds: ["exact:on-play:draw-n:trash-m:hand:self"],
      status: "supported",
    });
  });

  it("summarizes supported and unsupported generated-support evidence deterministically", () => {
    const matrixWithoutDraw = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "effect:draw:self:count:positive-safe-integer",
      ),
    };
    const missingCapabilityIndex = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-008D-003" as CardId,
          sourceText: "[On Play] Draw 1 card.",
          sourceTextHash: "sha256:source-3",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutDraw,
      validateEffectDefinition,
    });
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-008D-002" as CardId,
          sourceText: "[On Play] Draw 1 card. Then rest 1 DON!!.",
          sourceTextHash: "sha256:source-2",
        },
        {
          ...baseInput,
          cardId: "CARD-008D-001" as CardId,
          sourceText: "[On Play] Draw 1 card.",
          sourceTextHash: "sha256:source-1",
        },
        {
          ...baseInput,
          cardId: "CARD-008D-004" as CardId,
          sourceText: "[On Play] Draw 1 card.\n[When Attacking] Draw 1 card.",
          sourceTextHash: "sha256:source-4",
        },
      ],
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport({
      ...index,
      entries: [...index.entries, ...missingCapabilityIndex.entries],
    });

    expect(report).toEqual({
      blockerCount: 2,
      blockers: [
        {
          cardId: "CARD-008D-002",
          code: "unparsed-span",
          message: "Unsupported card text remains after certified parsing.",
          span: {
            end: 41,
            start: 23,
            text: "Then rest 1 DON!!.",
          },
        },
        {
          capabilityId: "effect:draw:self:count:positive-safe-integer",
          cardId: "CARD-008D-003",
          code: "missing-runtime-capability",
          component: "exact:on-play:draw-n:self",
          message:
            "Missing runtime capability effect:draw:self:count:positive-safe-integer for parser rule exact:on-play:draw-n:self.",
        },
      ],
      missingRuntimeCapabilityIds: [
        "effect:draw:self:count:positive-safe-integer",
      ],
      parserRuleIdsUsed: [
        "exact:on-play:draw-n:self",
        "exact:when-attacking:draw-n:self",
        "line-separated-effect-blocks:v1",
      ],
      statusByCardId: {
        "CARD-008D-001": {
          blockerCodes: [],
          missingCapabilityIds: [],
          parseStatus: "complete",
          parserRuleIds: ["exact:on-play:draw-n:self"],
          status: "supported",
        },
        "CARD-008D-002": {
          blockerCodes: ["unparsed-span"],
          missingCapabilityIds: [],
          parseStatus: "partial",
          parserRuleIds: ["exact:on-play:draw-n:self"],
          status: "unsupported",
        },
        "CARD-008D-003": {
          blockerCodes: ["missing-runtime-capability"],
          missingCapabilityIds: [
            "effect:draw:self:count:positive-safe-integer",
          ],
          parseStatus: "complete",
          parserRuleIds: ["exact:on-play:draw-n:self"],
          status: "unsupported",
        },
        "CARD-008D-004": {
          blockerCodes: [],
          missingCapabilityIds: [],
          parseStatus: "complete",
          parserRuleIds: [
            "exact:on-play:draw-n:self",
            "exact:when-attacking:draw-n:self",
            "line-separated-effect-blocks:v1",
          ],
          status: "supported",
        },
      },
      supportedCardIds: ["CARD-008D-001", "CARD-008D-004"],
      totalCards: 4,
      unparsedSpans: [
        {
          cardId: "CARD-008D-002",
          end: 41,
          start: 23,
          text: "Then rest 1 DON!!.",
        },
      ],
      unsupportedCardIds: ["CARD-008D-002", "CARD-008D-003"],
      unsupportedPrimitiveComponents: [],
    });
  });

  it("keeps unsupported primitive blockers visible when an index entry carries them", () => {
    const report = buildGeneratedSupportReport({
      effectDefinitions: {},
      entries: [
        {
          blockers: [
            {
              code: "unsupported-primitive",
              component: "effect:rest-don",
              message: "Resting DON is not covered by the runtime matrix.",
            },
          ],
          capabilityEvidence: [],
          cardId: "CARD-008D-005" as CardId,
          missingCapabilityIds: [],
          parseStatus: "unsupportedPrimitive",
          parserRuleIds: [],
          sourceTextHash: "sha256:source-5",
          status: "unsupported",
        },
      ],
    });

    expect(report.unsupportedPrimitiveComponents).toEqual(["effect:rest-don"]);
    expect(report.blockers).toEqual([
      {
        cardId: "CARD-008D-005",
        code: "unsupported-primitive",
        component: "effect:rest-don",
        message: "Resting DON is not covered by the runtime matrix.",
      },
    ]);
  });

  it("reports invalid draw-count blockers deterministically", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-009A-001" as CardId,
          sourceText: "[On Play] Draw 0 cards.",
          sourceTextHash: "sha256:invalid-count",
        },
      ],
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport(index);

    expect(report).toMatchObject({
      blockerCount: 1,
      blockers: [
        {
          cardId: "CARD-009A-001",
          code: "unparsed-span",
          message: "Card text is not covered by certified parser rules.",
          span: {
            end: 23,
            start: 0,
            text: "[On Play] Draw 0 cards.",
          },
        },
      ],
      statusByCardId: {
        "CARD-009A-001": {
          blockerCodes: ["unparsed-span"],
          missingCapabilityIds: [],
          parseStatus: "partial",
          parserRuleIds: [],
          status: "unsupported",
        },
      },
      supportedCardIds: [],
      unsupportedCardIds: ["CARD-009A-001"],
    });
  });

  it("includes draw-then-trash parser rules in report evidence when supported", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-009B-201" as CardId,
          sourceText: "[On Play] Draw 2 cards and trash 1 card from your hand.",
          sourceTextHash: "sha256:draw-trash-on-play",
        },
        {
          ...baseInput,
          cardId: "CARD-009B-202" as CardId,
          sourceText:
            "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
          sourceTextHash: "sha256:draw-trash-when-attacking-1t",
        },
      ],
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport(index);

    expect(report.parserRuleIdsUsed).toEqual(
      expect.arrayContaining([
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ]),
    );
    expect(report.unsupportedCardIds).toEqual([]);
  });

  it("reports missing draw-then-trash runtime capability blockers", () => {
    const matrixWithoutSequence = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) => capability.id !== "effect:sequence:ordered",
      ),
    };
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-009B-203" as CardId,
          sourceText:
            "[When Attacking] Draw 2 cards and trash 1 card from your hand.",
          sourceTextHash: "sha256:missing-sequence",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutSequence,
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport(index);

    expect(report).toMatchObject({
      blockerCount: 1,
      blockers: [
        {
          capabilityId: "effect:sequence:ordered",
          cardId: "CARD-009B-203",
          code: "missing-runtime-capability",
          component: "exact:when-attacking:draw-n:trash-m:hand:self",
        },
      ],
      missingRuntimeCapabilityIds: ["effect:sequence:ordered"],
      statusByCardId: {
        "CARD-009B-203": {
          blockerCodes: ["missing-runtime-capability"],
          missingCapabilityIds: ["effect:sequence:ordered"],
          parseStatus: "complete",
          parserRuleIds: ["exact:when-attacking:draw-n:trash-m:hand:self"],
          status: "unsupported",
        },
      },
      unsupportedCardIds: ["CARD-009B-203"],
    });
  });

  it("includes OP10-045 as supported with once-per-turn draw-then-trash parser rule evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "OP10-045" as CardId,
          sourceText:
            "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
          sourceTextHash: "sha256:op10-045-source",
        },
      ],
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport(index);

    expect(report.supportedCardIds).toEqual(["OP10-045"]);
    expect(report.unsupportedCardIds).toEqual([]);
    expect(report.parserRuleIdsUsed).toEqual([
      "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
    ]);
    expect(report.statusByCardId["OP10-045"]).toEqual({
      blockerCodes: [],
      missingCapabilityIds: [],
      parseStatus: "complete",
      parserRuleIds: [
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ],
      status: "supported",
    });
  });

  it("includes exact synthetic trash-then-draw support and reports missing segment-0 trash capability", () => {
    const missingSegment0TrashMatrix = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "trashFromHand:segment0:self:self:count-exact",
      ),
    };
    const supportedIndex = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-014C-SUPPORTED" as CardId,
          sourceText: "[On Play] Trash 2 cards from your hand. Draw 1 card.",
          sourceTextHash: "sha256:trash-draw-supported",
        },
      ],
      validateEffectDefinition,
    });
    const missingCapabilityIndex = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-014C-MISSING-CAP" as CardId,
          sourceText: "[On Play] Trash 2 cards from your hand. Draw 1 card.",
          sourceTextHash: "sha256:trash-draw-missing",
        },
      ],
      runtimeCapabilityMatrix: missingSegment0TrashMatrix,
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport({
      effectDefinitions: supportedIndex.effectDefinitions,
      entries: [...supportedIndex.entries, ...missingCapabilityIndex.entries],
    });

    expect(report.supportedCardIds).toEqual(["CARD-014C-SUPPORTED"]);
    expect(report.unsupportedCardIds).toEqual(["CARD-014C-MISSING-CAP"]);
    expect(report.parserRuleIdsUsed).toEqual([
      "exact:on-play:trash-2-from-hand:draw-1:self",
    ]);
    expect(report.missingRuntimeCapabilityIds).toEqual([
      "trashFromHand:segment0:self:self:count-exact",
    ]);
    expect(report.blockers).toEqual([
      {
        capabilityId: "trashFromHand:segment0:self:self:count-exact",
        cardId: "CARD-014C-MISSING-CAP",
        code: "missing-runtime-capability",
        component: "exact:on-play:trash-2-from-hand:draw-1:self",
        message:
          "Missing runtime capability trashFromHand:segment0:self:self:count-exact for parser rule exact:on-play:trash-2-from-hand:draw-1:self.",
      },
    ]);
  });

  it.each([
    "selectCards:hand:self:character:max1",
    "playSelected:hand:character:max1:ignoreCost",
  ])(
    "includes exact synthetic return-DON play-from-hand support and reports missing %s capability",
    (missingCapabilityId) => {
      const matrixWithoutCapability = {
        ...generatedSupportRuntimeCapabilityMatrix,
        capabilities:
          generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
            (capability) => capability.id !== missingCapabilityId,
          ),
      };
      const supportedIndex = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId: "CARD-014E-SUPPORTED" as CardId,
            sourceText:
              "[On Play] DON!! -1: Select up to 1 Character card from your hand and play it.",
            sourceTextHash: "sha256:return-don-play-supported",
          },
        ],
        validateEffectDefinition,
      });
      const missingCapabilityIndex = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId: "CARD-014E-MISSING-CAP" as CardId,
            sourceText:
              "[On Play] DON!! -1: Select up to 1 Character card from your hand and play it.",
            sourceTextHash: "sha256:return-don-play-missing",
          },
        ],
        runtimeCapabilityMatrix: matrixWithoutCapability,
        validateEffectDefinition,
      });

      const report = buildGeneratedSupportReport({
        effectDefinitions: supportedIndex.effectDefinitions,
        entries: [...supportedIndex.entries, ...missingCapabilityIndex.entries],
      });

      expect(report.supportedCardIds).toEqual(["CARD-014E-SUPPORTED"]);
      expect(report.unsupportedCardIds).toEqual(["CARD-014E-MISSING-CAP"]);
      expect(report.parserRuleIdsUsed).toEqual([
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
      ]);
      expect(report.missingRuntimeCapabilityIds).toEqual([missingCapabilityId]);
      expect(report.blockers).toEqual([
        {
          capabilityId: missingCapabilityId,
          cardId: "CARD-014E-MISSING-CAP",
          code: "missing-runtime-capability",
          component:
            "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
          message: `Missing runtime capability ${missingCapabilityId} for parser rule exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected.`,
        },
      ]);
    },
  );

  it("reports CARD-014F optionality and condition parser evidence deterministically", () => {
    const missingOptionalMatrix = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "optionalEffectBlock:onPlay:draw-1:self",
      ),
    };
    const supportedIndex = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-014F-YOUR-TURN" as CardId,
          sourceText: "[On Play] During your turn, draw 1 card.",
          sourceTextHash: "sha256:your-turn",
        },
        {
          ...baseInput,
          cardId: "CARD-014F-ATTACHED-DON" as CardId,
          sourceText:
            "[On Play] If this Character has 1 or more DON!! cards attached, draw 1 card.",
          sourceTextHash: "sha256:attached-don",
        },
      ],
      validateEffectDefinition,
    });
    const missingCapabilityIndex = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-014F-OPTIONAL-MISSING-CAP" as CardId,
          sourceText: "[On Play] You may draw 1 card.",
          sourceTextHash: "sha256:optional-missing",
        },
      ],
      runtimeCapabilityMatrix: missingOptionalMatrix,
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport({
      effectDefinitions: supportedIndex.effectDefinitions,
      entries: [...supportedIndex.entries, ...missingCapabilityIndex.entries],
    });

    expect(report.supportedCardIds).toEqual([
      "CARD-014F-ATTACHED-DON",
      "CARD-014F-YOUR-TURN",
    ]);
    expect(report.unsupportedCardIds).toEqual([
      "CARD-014F-OPTIONAL-MISSING-CAP",
    ]);
    expect(report.parserRuleIdsUsed).toEqual([
      "exact:condition:self-attached-don-count",
      "exact:condition:your-turn",
      "exact:on-play:optional-effect:draw-1:self",
    ]);
    expect(report.missingRuntimeCapabilityIds).toEqual([
      "optionalEffectBlock:onPlay:draw-1:self",
    ]);
    expect(report.statusByCardId["CARD-014F-OPTIONAL-MISSING-CAP"]).toEqual({
      blockerCodes: ["missing-runtime-capability"],
      missingCapabilityIds: ["optionalEffectBlock:onPlay:draw-1:self"],
      parseStatus: "complete",
      parserRuleIds: ["exact:on-play:optional-effect:draw-1:self"],
      status: "unsupported",
    });
  });

  it("includes CARD-013B keyword parser rules in supported report evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "OP01-025" as CardId,
          category: "character",
          printedKeywords: ["rush"],
          sourceText:
            "[Rush] (This card can attack on the turn in which it is played.)",
          sourceTextHash: "sha256:op01-025-source",
        },
        {
          ...baseInput,
          cardId: "P-028" as CardId,
          category: "character",
          printedKeywords: ["doubleAttack"],
          sourceText: "[Double Attack] (This card deals 2 damage.)",
          sourceTextHash: "sha256:p-028-source",
        },
      ],
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport(index);

    expect(report.supportedCardIds).toEqual(["OP01-025", "P-028"]);
    expect(report.unsupportedCardIds).toEqual([]);
    expect(report.parserRuleIdsUsed).toEqual([
      "exact:keyword:double-attack:standalone",
      "exact:keyword:rush:standalone",
    ]);
  });

  it("reports every blocked CARD-014H representative candidate with existing diagnostics", () => {
    const blockedRows = listRepresentativeSupportProofMatrixRows().filter(
      (row) => row.status === "blocked-missing-layer",
    );
    const indices = blockedRows.map((row) =>
      buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId: row.syntheticDiagnosticCardId,
            sourceText: row.sourceText,
            sourceTextHash: `sha256:${row.candidateId}`,
          },
        ],
        runtimeCapabilityMatrix: generatedSupportRuntimeCapabilityMatrix,
        validateEffectDefinition,
      }),
    );

    const report = buildGeneratedSupportReport({
      effectDefinitions: {},
      entries: indices.flatMap((index) => index.entries),
    });

    expect(report.supportedCardIds).toEqual([]);
    expect(report.unsupportedCardIds).toEqual(
      blockedRows
        .map((row) => row.syntheticDiagnosticCardId)
        .sort((left, right) => String(left).localeCompare(String(right))),
    );

    for (const row of blockedRows) {
      expect(
        report.statusByCardId[row.syntheticDiagnosticCardId],
      ).toMatchObject({
        blockerCodes: row.existingDiagnosticCodes,
        status: "unsupported",
      });
      for (const code of row.existingDiagnosticCodes) {
        expect(report.blockers).toContainEqual(
          expect.objectContaining({
            cardId: row.syntheticDiagnosticCardId,
            code,
          }),
        );
      }
    }
  });
});
