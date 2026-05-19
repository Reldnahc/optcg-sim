import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CardId, PoneglyphCardDetail } from "@optcg/types";

import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";
import { runSupportProbe } from "./support-probe.js";

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

function toCardId(value: string): CardId {
  return value as CardId;
}

async function loadOp03044Fixture(): Promise<PoneglyphCardDetail> {
  const source = await readFile(
    path.join(repoRoot, "fixtures/poneglyph/cards/OP03-044.kaya.json"),
    "utf8",
  );
  return JSON.parse(source) as PoneglyphCardDetail;
}

describe("conditional generated support diagnostics", () => {
  it("marks supported conditional composition as playable when runtime gates are present", () => {
    const sourceText =
      "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand, draw 2 cards.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-015A-REPORT-CONDITIONAL" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-015a-report-conditional",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);

    expect(
      report.blockers.find(
        (candidate) => candidate.cardId === "CARD-015A-REPORT-CONDITIONAL",
      ),
    ).toBeUndefined();
    expect(report.unsupportedCardIds).toEqual([]);
    expect(report.supportedCardIds).toEqual(["CARD-015A-REPORT-CONDITIONAL"]);
  });

  it.each([
    {
      cardId: "CARD-019B-REPORT-CONDITIONAL-WHEN-ATTACKING",
      sourceText:
        "[When Attacking] If your Leader is multicolored, draw 2 cards.",
    },
    {
      cardId: "CARD-019B-REPORT-CONDITIONAL-TRIGGER",
      sourceText: "[Trigger] If your Leader is multicolored, draw 2 cards.",
    },
    {
      cardId: "CARD-019B-REPORT-CONDITIONAL-ON-KO",
      sourceText: "[On K.O.] If your Leader is multicolored, draw 2 cards.",
    },
  ])(
    "marks representative non-On-Play conditional wrapper composition as playable ($cardId)",
    ({ cardId, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId: cardId as CardId,
            sourceText,
            sourceTextHash: `sha256:${cardId.toLowerCase()}`,
          },
        ],
        validateEffectDefinition,
      });
      const report = buildGeneratedSupportReport(index);

      expect(
        report.blockers.find((candidate) => candidate.cardId === cardId),
      ).toBeUndefined();
      expect(report.unsupportedCardIds).toEqual([]);
      expect(report.supportedCardIds).toEqual([cardId]);
    },
  );

  it("fails closed on ambiguous mixed and/or condition chains", () => {
    const sourceText =
      "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand or your opponent has 1 or more Life cards, draw 1 card.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-019B-REPORT-MIXED-CONNECTORS" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-019b-report-mixed-connectors",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);

    expect(report.supportedCardIds).toEqual([]);
    expect(report.unsupportedCardIds).toEqual([
      "CARD-019B-REPORT-MIXED-CONNECTORS",
    ]);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardId: "CARD-019B-REPORT-MIXED-CONNECTORS",
          code: "unparsed-span",
        }),
      ]),
    );
  });

  it("keeps supported child conditions recognized when a connector child fragment is unsupported", async () => {
    const detail = await loadOp03044Fixture();
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("CARD-019A-PROBE-OPP-HAND-AMBIG"),
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "CARD-019A-PROBE-OPP-HAND-AMBIG",
          effect:
            "[On Play] If your Leader is multicolored and your opponent has 3 or more cards in your hand, draw 2 cards.",
          name: "Conditional Opponent Hand Ambiguous Candidate",
        }),
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
      "recognized condition candidate: your Leader is multicolored",
    );
    expect(text).toContain("unsupported condition connector blocker: and");
    expect(text).toContain(
      "unsupported condition predicate: your opponent has 3 or more cards in your hand",
    );
  });

  it("reports supported singular conditional draw probes as playable with no blockers", async () => {
    const detail = await loadOp03044Fixture();
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("CARD-015A-PROBE-CONDITIONAL-SINGULAR"),
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "CARD-015A-PROBE-CONDITIONAL-SINGULAR",
          effect:
            "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand, draw 1 card.",
          name: "Conditional Draw Singular Probe Candidate",
        }),
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
    expect(text).toContain("Blockers: none");
    expect(text).not.toContain("draw 1 cards");
  });
});
