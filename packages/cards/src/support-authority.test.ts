import { describe, expect, it } from "vitest";

import { readCardsPackageSourceFiles } from "./architecture-source-scan.js";
import { evaluatePrimitiveSupport } from "./support-evaluator.js";
import type { PrimitiveParseResult } from "./types.js";

describe("primitive support authority", () => {
  it("rejects exact metadata without primitive parser evidence", () => {
    const result: PrimitiveParseResult = {
      node: { type: "effect", effectType: "draw" },
      evidence: [],
      metadata: {
        parserRuleId: "exact:on-play:draw",
        shapeId: "on-play-draw",
        componentEvidenceId: "on-play-draw",
        cardId: "SYNTHETIC-001",
        sourceText: "[On Play] Draw 1 card.",
      },
    };

    expect(evaluatePrimitiveSupport(result).supported).toBe(false);
  });

  it("supports only current emitted primitive parser evidence", () => {
    const result: PrimitiveParseResult = {
      node: { type: "effect", effectType: "draw" },
      evidence: [
        "wrapper:onPlay",
        "body:draw",
        "count:positiveInteger",
        "sourcePresence:mustRemain",
        "composition:wrapperBody",
      ],
    };

    expect(evaluatePrimitiveSupport(result).supported).toBe(true);
  });

  it("fails closed when any required primitive evidence is missing", () => {
    const completeEvidence = [
      "wrapper:onPlay",
      "body:draw",
      "count:positiveInteger",
      "sourcePresence:mustRemain",
      "composition:wrapperBody",
    ] as const;

    for (const omitted of completeEvidence) {
      const result: PrimitiveParseResult = {
        node: { type: "effect", effectType: "draw" },
        evidence: completeEvidence.filter((entry) => entry !== omitted),
      };

      expect(evaluatePrimitiveSupport(result), omitted).toMatchObject({
        supported: false,
        missingEvidence: [omitted],
      });
    }
  });

  it("does not let support evaluator read exact authority fields", async () => {
    const files = await readCardsPackageSourceFiles();
    const evaluatorFiles = files.filter((file) =>
      file.path.endsWith("/support-evaluator.ts"),
    );

    expect(evaluatorFiles.length).toBe(1);
    expect(evaluatorFiles[0]?.contents).not.toMatch(
      /\b(?:parserRuleId|shapeId|componentEvidenceId|cardId|sourceText)\b/,
    );
  });
});
