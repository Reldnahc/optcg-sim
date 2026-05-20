import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CardId, PoneglyphCardDetail } from "@optcg/types";

import {
  deriveConditionalConditionDiagnostics,
  parseConditionExpression,
} from "./conditional-parser-components.js";
import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";
import {
  generatedSupportRuntimeCapabilityMatrix,
  hasRuntimeCapability,
} from "./runtime-capability-matrix.js";
import { runSupportProbe } from "./support-probe.js";
import { listRequiredRuntimeCapabilityIdsForComponentEvidenceId } from "./generated-support-types.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const baseInput = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
};

const validateEffectDefinition = () => ({ valid: true }) as const;

describe("SUP-001E DON field-count condition card components", () => {
  it.each([
    {
      component: {
        filter: { categories: ["don"] },
        op: "lte",
        player: "self",
        type: "fieldCount",
        value: 6,
      },
      id: "condition:fieldCount:don:self:lte:6",
      sourceText: "you have 6 or less DON!! cards on your field",
    },
    {
      component: {
        filter: { categories: ["don"] },
        op: "gte",
        player: "opponent",
        type: "fieldCount",
        value: 8,
      },
      id: "condition:fieldCount:don:opponent:gte:8",
      sourceText: "your opponent has 8 or more DON!! cards on their field",
    },
    {
      component: {
        filter: { categories: ["don"] },
        op: "eq",
        player: "self",
        type: "fieldCount",
        value: 2,
      },
      id: "condition:fieldCount:don:self:eq:2",
      sourceText: "you have 2 DON!! cards on your field",
    },
    {
      component: {
        filter: { categories: ["don"] },
        op: "eq",
        player: "opponent",
        type: "fieldCount",
        value: 2,
      },
      id: "condition:fieldCount:don:opponent:eq:2",
      sourceText: "your opponent has 2 DON!! cards on their field",
    },
  ] as const)(
    "parses public DON field-count condition component $sourceText",
    ({ component, id, sourceText }) => {
      expect(parseConditionExpression(sourceText)).toMatchObject({
        component,
        id,
        text: sourceText,
        type: "supported",
      });
    },
  );

  it("proves DON field-count parsing is generic over thresholds and comparators", () => {
    expect(
      parseConditionExpression("you have 3 or more DON!! cards on your field"),
    ).toMatchObject({
      component: {
        filter: { categories: ["don"] },
        op: "gte",
        player: "self",
        type: "fieldCount",
        value: 3,
      },
      id: "condition:fieldCount:don:self:gte:3",
      type: "supported",
    });
    expect(
      parseConditionExpression(
        "your opponent has 10 or less DON!! cards on their field",
      ),
    ).toMatchObject({
      component: {
        filter: { categories: ["don"] },
        op: "lte",
        player: "opponent",
        type: "fieldCount",
        value: 10,
      },
      id: "condition:fieldCount:don:opponent:lte:10",
      type: "supported",
    });
    expect(
      parseConditionExpression("you have 0 DON!! cards on your field"),
    ).toMatchObject({
      component: {
        filter: { categories: ["don"] },
        op: "eq",
        player: "self",
        type: "fieldCount",
        value: 0,
      },
      id: "condition:fieldCount:don:self:eq:0",
      type: "supported",
    });
    expect(
      parseConditionExpression(
        "your opponent has 0 or more DON!! cards on their field",
      ),
    ).toMatchObject({
      component: {
        filter: { categories: ["don"] },
        op: "gte",
        player: "opponent",
        type: "fieldCount",
        value: 0,
      },
      id: "condition:fieldCount:don:opponent:gte:0",
      type: "supported",
    });
  });

  it("emits supported diagnostics for DON field-count condition components", () => {
    const diagnostics = deriveConditionalConditionDiagnostics(
      "your Leader is multicolored and you have 6 or less DON!! cards on your field",
    );

    expect(diagnostics.isFullySupportedConditionExpression).toBe(true);
    expect(diagnostics.unsupportedConditionFragments).toEqual([]);
    expect(diagnostics.unsupportedSyntaxFragments).toEqual([]);
    expect(diagnostics.traceComponents).toEqual([
      {
        id: "condition:leaderColorCount:self:gte:2",
        kind: "condition",
        span: {
          end: 27,
          start: 0,
          text: "your Leader is multicolored",
        },
        status: "supported",
        text: "your Leader is multicolored",
      },
      {
        id: "condition-connector:and:28-31",
        kind: "condition-connector",
        span: { end: 31, start: 28, text: "and" },
        status: "supported",
        text: "and",
      },
      {
        id: "condition:fieldCount:don:self:lte:6",
        kind: "condition",
        span: {
          end: 76,
          start: 32,
          text: "you have 6 or less DON!! cards on your field",
        },
        status: "supported",
        text: "you have 6 or less DON!! cards on your field",
      },
    ]);
  });

  it.each([
    "you have one or less DON!! cards on your field",
    "you have 01 DON!! cards on your field",
    "you have 1.5 DON!! cards on your field",
    "you have -1 DON!! cards on your field",
    "you have 6 or fewer DON!! cards on your field",
    "you have 6 or less DON!! cards in your DON!! deck",
    "you have 6 or less DON!! cards in your trash",
    "you have 6 or less DON!! cards on the field",
    "you have 6 or less DON!! cards on their field",
    "your opponent has 6 or less DON!! cards on your field",
    "the turn player has 6 or less DON!! cards on their field",
    "you and your opponent have 6 or less DON!! cards on your field",
  ])(
    "fails closed for unsupported DON field-count wording: %s",
    (sourceText) => {
      expect(parseConditionExpression(sourceText)).toMatchObject({
        text: sourceText,
        type: "unsupported-fragment",
      });
    },
  );

  it("exposes DON field-count condition runtime capability evidence only for the reviewed public shape", () => {
    const capability =
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (candidate) => candidate.id === "condition:fieldCount:don:public",
      );

    expect(capability).toMatchObject({
      id: "condition:fieldCount:don:public",
      kind: "condition",
      sinceStory: "SUP-001B",
      supported: true,
    });
    expect(capability?.supportedComponentIds).toContain(
      "condition-field-count-don-public",
    );
    expect(
      listRequiredRuntimeCapabilityIdsForComponentEvidenceId(
        "condition-field-count-don-public",
      ),
    ).toEqual(["condition:fieldCount:don:public"]);
    expect(hasRuntimeCapability("condition:fieldCount:don:public")).toBe(true);
    expect(hasRuntimeCapability("condition:fieldCount:private")).toBe(false);
  });

  it("composes DON field-count conditions with supported conditional draw bodies", () => {
    const sourceText =
      "[On Play] If you have 6 or less DON!! cards on your field, draw 1 card.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "SUP-001E-CONDITIONAL-DRAW" as CardId,
          sourceText,
          sourceTextHash: "sha256:sup-001e-conditional-draw",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);

    expect(Object.keys(index.effectDefinitions)).toEqual([
      "sup-001e-conditional-draw.generated-support",
    ]);
    expect(report.supportedCardIds).toEqual(["SUP-001E-CONDITIONAL-DRAW"]);
    expect(report.unsupportedCardIds).toEqual([]);
    expect(report.statusByCardId["SUP-001E-CONDITIONAL-DRAW"]).toMatchObject({
      componentEvidenceIds: ["on-play-draw"],
      parserRuleIds: ["exact:on-play:draw-n:self"],
      status: "supported",
    });
    expect(
      report.proofCertificatesByCardId["SUP-001E-CONDITIONAL-DRAW"]
        ?.requiredRuntimeCapabilityIds,
    ).toEqual(
      expect.arrayContaining([
        "condition:fieldCount:don:public",
        "effect:draw:self:count:positive-safe-integer",
        "trigger:onPlay",
      ]),
    );
    expect(report.blockers).toEqual([]);
  });

  it("reports DON field-count condition diagnostics while unsupported bodies remain unplayable", () => {
    const sourceText =
      "If you have 6 or less DON!! cards on your field, this Character gains [Rush].";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "SUP-001E-UNSUPPORTED-BODY" as CardId,
          sourceText,
          sourceTextHash: "sha256:sup-001e-unsupported-body",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) => candidate.cardId === "SUP-001E-UNSUPPORTED-BODY",
    );

    expect(report.supportedCardIds).toEqual([]);
    expect(report.unsupportedCardIds).toEqual(["SUP-001E-UNSUPPORTED-BODY"]);
    expect(report.statusByCardId["SUP-001E-UNSUPPORTED-BODY"]).toMatchObject({
      componentEvidenceIds: ["condition-field-count-don-public"],
      parserRuleIds: ["condition-component:field-count-don-public"],
      status: "unsupported",
    });
    expect(
      report.proofCertificatesByCardId["SUP-001E-UNSUPPORTED-BODY"]
        ?.requiredRuntimeCapabilityIds,
    ).toEqual(["condition:fieldCount:don:public"]);
    expect(blocker?.decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "condition:fieldCount:don:self:lte:6",
          kind: "condition",
          status: "supported",
          text: "you have 6 or less DON!! cards on your field",
        }),
        expect.objectContaining({
          kind: "keyword",
          status: "supported",
          text: "[Rush]",
        }),
      ]),
    );
    expect(blocker?.decomposition?.unsupportedSyntaxFragments).toContain(
      "conditional-keyword-grant:schema-runtime-bridge-missing",
    );
  });

  it("prints support-probe diagnostics for DON field-count conditions without making unsupported bodies playable", async () => {
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: "SUP-001E-PROBE" as CardId,
      getCard: () =>
        Promise.resolve(
          syntheticCardDetail(
            "SUP-001E-PROBE",
            "If your opponent has 8 or more DON!! cards on their field, this Character gains [Banish].",
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
      "recognized condition candidate: your opponent has 8 or more DON!! cards on their field",
    );
    expect(text).toContain("recognized target candidate: this Character");
    expect(text).toContain("recognized keyword candidate: [Banish]");
    expect(text).toContain(
      "unsupported syntax blocker: conditional-keyword-grant:schema-runtime-bridge-missing",
    );
  });

  it("does not add real-card or exact sample branches for DON field-count components", async () => {
    const productionFiles = [
      "certified-card-text-parser.ts",
      "conditional-generated-support-composer.ts",
      "conditional-parser-components.ts",
      "generated-support-index.ts",
      "generated-support-types.ts",
      "runtime-capability-matrix.ts",
      "standalone-keyword-parser.ts",
    ];
    const productionSource = (
      await Promise.all(
        productionFiles.map((fileName) =>
          readFile(path.join(repoRoot, "packages/cards/src", fileName), "utf8"),
        ),
      )
    ).join("\n");

    expect(productionSource).not.toContain(
      "you have 6 or less DON!! cards on your field",
    );
    expect(productionSource).not.toContain("SUP-001E-PROBE");
    expect(productionSource).not.toContain("SUP-001E-CONDITIONAL-DRAW");
    expect(productionSource).not.toContain("SUP-001E-UNSUPPORTED-BODY");
    expect(productionSource).not.toContain(
      "If your opponent has 8 or more DON!! cards on their field, this Character gains [Banish].",
    );
    expect(productionSource).not.toContain(
      "[On Play] If you have 6 or less DON!! cards on your field, draw 1 card.",
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
    set_name: "Synthetic SUP-001E Tests",
    trigger: null,
    types: ["Synthetic"],
    variants: [],
  };
}
