import { describe, expect, it } from "vitest";

import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";
import { listRepresentativeSupportProofMatrixRows } from "./representative-fixtures.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";

const baseInput = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
};

const validateEffectDefinition = () => ({ valid: true }) as const;

describe("generated support report diagnostics", () => {
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
