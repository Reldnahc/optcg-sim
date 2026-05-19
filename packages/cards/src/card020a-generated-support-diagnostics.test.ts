import { describe, expect, it } from "vitest";
import type { CardId } from "@optcg/types";

import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";

const baseInput = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
};

const validateEffectDefinition = () => ({ valid: true }) as const;

describe("CARD-020A generated support diagnostics", () => {
  it("keeps CARD-020A diagnostics free of exact full-card text branches", async () => {
    const productionSources = await import("node:fs/promises").then((fs) =>
      Promise.all([
        fs.readFile(new URL("./generated-support-index.ts", import.meta.url), {
          encoding: "utf8",
        }),
        fs.readFile(
          new URL("./generated-support-diagnostics.ts", import.meta.url),
          { encoding: "utf8" },
        ),
      ]),
    );
    const source = productionSources.join("\n");

    expect(source).not.toContain(
      "[On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.",
    );
    expect(source).not.toContain(
      "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].",
    );
  });

  it("reports structured Supernovas/Cavendish/DON-active decomposition while remaining unsupported", () => {
    const sourceText =
      "[On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020A-REPORT-SUPERNOVAS" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-020a-report-supernovas",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) => candidate.cardId === "CARD-020A-REPORT-SUPERNOVAS",
    );
    const decomposition = blocker?.decomposition;

    expect(report.unsupportedCardIds).toEqual(["CARD-020A-REPORT-SUPERNOVAS"]);
    expect(report.supportedCardIds).toEqual([]);
    expect(report.statusByCardId["CARD-020A-REPORT-SUPERNOVAS"]).toMatchObject({
      componentEvidenceIds: [],
      missingCapabilityIds: [],
      parseStatus: "partial",
      parserRuleIds: [],
      status: "unsupported",
    });
    expect(blocker?.code).toBe("unparsed-span");
    expect(decomposition?.recognizedActionCandidates).toEqual([]);
    expect(decomposition?.recognizedTriggerCandidates).toEqual([
      "[On Play]",
      "[When Attacking]",
    ]);
    expect(decomposition?.unsupportedConditionFragments).toEqual([
      "you have no other [Cavendish] Characters",
    ]);
    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "cardinality",
          status: "recognized",
          text: "up to 2",
        }),
      ]),
    );
    expect(decomposition?.unsupportedSyntaxFragments).toEqual(
      expect.arrayContaining([
        "condition:field-count-missing",
        "condition:name-filter-missing",
        "condition:exclude-self-or-other-self-missing",
        "action:don-set-active-unsupported",
        "action:own-don-target-unsupported",
        "action:active-state-result-unsupported",
        "body-or-runtime-capability-evidence:missing",
        "runtime-capability:don-set-active-missing",
      ]),
    );
    expect(decomposition?.unsupportedSyntaxFragments).not.toContain(
      "action:up-to-cardinality-unsupported",
    );
  });

  it("reports DON-active decomposition generically for up-to cardinalities", () => {
    const sourceText =
      "[On Play]/[When Attacking] If your Leader has the {Dressrosa} type and you have no other [Rebecca] Characters, set up to 3 of your DON!! cards as active.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020A-REPORT-GENERIC-DON-ACTIVE" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-020a-report-generic-don-active",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) => candidate.cardId === "CARD-020A-REPORT-GENERIC-DON-ACTIVE",
    );
    const decomposition = blocker?.decomposition;

    expect(report.unsupportedCardIds).toEqual([
      "CARD-020A-REPORT-GENERIC-DON-ACTIVE",
    ]);
    expect(decomposition?.recognizedActionCandidates).toEqual([]);
    expect(decomposition?.recognizedTriggerCandidates).toEqual([
      "[On Play]",
      "[When Attacking]",
    ]);
    expect(decomposition?.unsupportedConditionFragments).toEqual([
      "you have no other [Rebecca] Characters",
    ]);
    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "condition",
          status: "recognized",
          text: "your Leader has the {Dressrosa} type",
        }),
        expect.objectContaining({
          kind: "condition",
          status: "unsupported",
          text: "you have no other [Rebecca] Characters",
        }),
        expect.objectContaining({
          kind: "cardinality",
          status: "recognized",
          text: "up to 3",
        }),
        expect.objectContaining({
          kind: "target",
          status: "unsupported",
          text: "your DON!! cards",
        }),
      ]),
    );
    expect(decomposition?.unsupportedSyntaxFragments).toEqual(
      expect.arrayContaining([
        "condition:field-count-missing",
        "condition:name-filter-missing",
        "condition:exclude-self-or-other-self-missing",
        "action:don-set-active-unsupported",
        "action:own-don-target-unsupported",
        "action:active-state-result-unsupported",
        "body-or-runtime-capability-evidence:missing",
        "runtime-capability:don-set-active-missing",
      ]),
    );
    expect(decomposition?.unsupportedSyntaxFragments).not.toContain(
      "action:up-to-cardinality-unsupported",
    );
  });

  it("reports generic slash-wrapper conditional components without DON-active body coupling", () => {
    const sourceText =
      "[On Play]/[When Attacking] If your Leader has the {Sky Island} type, this Character gains [Rush].";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020A-REPORT-GENERIC-SLASH" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-020a-report-generic-slash",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) => candidate.cardId === "CARD-020A-REPORT-GENERIC-SLASH",
    );
    const decomposition = blocker?.decomposition;

    expect(report.unsupportedCardIds).toEqual([
      "CARD-020A-REPORT-GENERIC-SLASH",
    ]);
    expect(decomposition?.recognizedTriggerCandidates).toEqual([
      "[On Play]",
      "[When Attacking]",
    ]);
    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "condition",
          status: "recognized",
          text: "your Leader has the {Sky Island} type",
        }),
        expect.objectContaining({
          kind: "action",
          status: "unsupported",
          text: "this Character gains [Rush]",
        }),
      ]),
    );
    expect(decomposition?.unsupportedSyntaxFragments).toEqual(
      expect.arrayContaining([
        "wrapper:slash-combined-unsupported",
        "body:unsupported",
      ]),
    );
  });

  it("reports slash-wrapper body components without requiring conditional text", () => {
    const sourceText =
      "[On Play]/[When Attacking] Give up to 1 of your opponent's Characters -1 cost during this turn. Then, K.O. up to 1 of your opponent's Characters with a cost of 0.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020A-REPORT-SLASH-SEQUENCE" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-020a-report-slash-sequence",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) => candidate.cardId === "CARD-020A-REPORT-SLASH-SEQUENCE",
    );
    const decomposition = blocker?.decomposition;

    expect(report.unsupportedCardIds).toEqual([
      "CARD-020A-REPORT-SLASH-SEQUENCE",
    ]);
    expect(decomposition?.recognizedTriggerCandidates).toEqual([
      "[On Play]",
      "[When Attacking]",
    ]);
    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "wrapper", text: "Then" }),
        expect.objectContaining({
          kind: "cardinality",
          status: "recognized",
          text: "up to 1",
        }),
        expect.objectContaining({
          kind: "target",
          status: "recognized",
          text: "your opponent's Characters",
        }),
        expect.objectContaining({
          kind: "modifier",
          status: "unsupported",
          text: "-1 cost during this turn",
        }),
        expect.objectContaining({
          kind: "action",
          status: "unsupported",
          text: "K.O.",
        }),
        expect.objectContaining({
          kind: "predicate",
          status: "recognized",
          text: "cost of 0",
        }),
      ]),
    );
    expect(decomposition?.unsupportedSyntaxFragments).toEqual(
      expect.arrayContaining([
        "wrapper:slash-combined-unsupported",
        "body:then-sequence-unsupported",
        "modifier:cost-reduction-unsupported",
        "action:ko-unsupported",
      ]),
    );
  });

  it("reports unsupported unwrapped continuous decomposition and preserves recognized On K.O. candidate", () => {
    const sourceText =
      "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].\n[On K.O.] Draw 1 card.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020A-REPORT-CONTINUOUS" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-020a-report-continuous",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) => candidate.cardId === "CARD-020A-REPORT-CONTINUOUS",
    );
    const decomposition = blocker?.decomposition;

    expect(report.unsupportedCardIds).toEqual(["CARD-020A-REPORT-CONTINUOUS"]);
    expect(report.statusByCardId["CARD-020A-REPORT-CONTINUOUS"]).toMatchObject({
      componentEvidenceIds: ["on-ko-draw"],
      missingCapabilityIds: [],
      parseStatus: "partial",
      parserRuleIds: ["exact:on-ko:draw-n:self"],
      status: "unsupported",
    });
    expect(blocker?.code).toBe("unparsed-span");
    expect(decomposition?.recognizedActionCandidates).toEqual(["Draw 1 card"]);
    expect(decomposition?.recognizedTriggerCandidates).toEqual(["[On K.O.]"]);
    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action",
          status: "unsupported",
          text: "and",
        }),
      ]),
    );
    expect(decomposition?.recognizedSyntaxFragments).toEqual(
      expect.arrayContaining(["wrapper:unwrapped-continuous-static-if"]),
    );
    expect(decomposition?.unsupportedConditionFragments).toEqual([
      "you have 7 or more cards in your trash",
    ]);
    expect(decomposition?.unsupportedSyntaxFragments).toEqual(
      expect.arrayContaining([
        "condition:trash-count-unsupported",
        "body:protection-removal-unsupported",
        "body:keyword-grant-blocker-unsupported",
        "body:and-composition-unsupported",
      ]),
    );
  });

  it("does not attach parsed On K.O. draw candidates to every unparsed sibling span", () => {
    const sourceText =
      "If your Leader has the {Sky Island} type, this Character gains [Rush].\nIf your Leader has the {Alabasta} type, this Character gains [Banish].\n[On K.O.] Draw 1 card.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020A-REPORT-MULTI-UNPARSED" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-020a-report-multi-unparsed",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blockers = report.blockers.filter(
      (candidate) => candidate.cardId === "CARD-020A-REPORT-MULTI-UNPARSED",
    );

    expect(
      report.statusByCardId["CARD-020A-REPORT-MULTI-UNPARSED"],
    ).toMatchObject({
      componentEvidenceIds: ["on-ko-draw"],
      parseStatus: "partial",
      parserRuleIds: ["exact:on-ko:draw-n:self"],
      status: "unsupported",
    });
    expect(blockers).toHaveLength(2);
    for (const blocker of blockers) {
      expect(blocker.decomposition?.recognizedActionCandidates).toEqual([]);
      expect(blocker.decomposition?.recognizedTriggerCandidates).toEqual([]);
      expect(blocker.decomposition?.traceComponents).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ kind: "trigger", text: "[On K.O.]" }),
          expect.objectContaining({ kind: "action", text: "Draw 1 card" }),
        ]),
      );
    }
  });

  it("reports parsed On K.O. draw sibling candidates from source text", () => {
    const sourceText =
      "If your Leader has the {Sky Island} type, this Character gains [Rush].\n[On K.O.] Draw 2 cards.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020A-REPORT-ON-KO-DRAW-2" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-020a-report-on-ko-draw-2",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) => candidate.cardId === "CARD-020A-REPORT-ON-KO-DRAW-2",
    );

    expect(
      report.statusByCardId["CARD-020A-REPORT-ON-KO-DRAW-2"],
    ).toMatchObject({
      componentEvidenceIds: ["on-ko-draw"],
      parserRuleIds: ["exact:on-ko:draw-n:self"],
      status: "unsupported",
    });
    expect(blocker?.decomposition?.recognizedActionCandidates).toEqual([
      "Draw 2 cards",
    ]);
    expect(blocker?.decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "trigger", text: "[On K.O.]" }),
        expect.objectContaining({
          kind: "action",
          status: "supported",
          text: "Draw 2 cards",
        }),
      ]),
    );
  });
});
