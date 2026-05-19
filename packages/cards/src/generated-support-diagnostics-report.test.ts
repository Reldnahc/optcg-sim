import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CardId } from "@optcg/types";

import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";
import { normalizePoneglyphCardDetail } from "./normalization.js";
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

describe("generated support diagnostics report", () => {
  it("reports an ordered proof certificate for supported generated-support cards", () => {
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
    const status = report.statusByCardId["OP03-044"];

    expect(
      status?.proofCertificate.supportChain.map((step) => step.name),
    ).toEqual([
      "source/behavior hash status",
      "parse completeness",
      "generated DSL schema validation",
      "component evidence IDs",
      "required runtime capability IDs",
      "missing runtime capability IDs",
      "engine-proof/test-evidence status",
      "final playable decision",
    ]);
    expect(status?.proofCertificate.playable).toBe(true);
    expect(status?.proofCertificate.supportChain[0]).toMatchObject({
      order: 1,
      status: "source=current; behavior=not-represented",
    });
    expect(status?.proofCertificate.supportChain[1]).toMatchObject({
      order: 2,
      status: "complete",
    });
    expect(status?.proofCertificate.supportChain[2]).toMatchObject({
      order: 3,
      status: "pass",
    });
    expect(status?.proofCertificate.supportChain[3]).toMatchObject({
      ids: ["on-play-draw-then-trash-from-hand"],
      order: 4,
      status: "present",
    });
    expect(status?.proofCertificate.supportChain[4]?.ids).toEqual(
      expect.arrayContaining([
        "category:auto",
        "effect:draw:self:count:positive-safe-integer",
      ]),
    );
    expect(status?.proofCertificate.supportChain[5]).toMatchObject({
      order: 6,
      status: "none",
    });
    expect(status?.proofCertificate.supportChain[6]).toMatchObject({
      order: 7,
      status: "present",
    });
    expect(status?.proofCertificate.supportChain[7]).toMatchObject({
      order: 8,
      status: "yes",
    });
  });

  it("keeps parsed and schema-valid cards unsupported when runtime capability proof is missing", () => {
    const matrixWithoutDraw = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "effect:draw:self:count:positive-safe-integer",
      ),
    };
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020D-MISSING-RUNTIME" as CardId,
          sourceText: "[On Play] Draw 1 card.",
          sourceTextHash: "sha256:card-020d-missing-runtime",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutDraw,
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport(index);
    const status = report.statusByCardId["CARD-020D-MISSING-RUNTIME"];

    expect(report.supportedCardIds).toEqual([]);
    expect(report.unsupportedCardIds).toEqual(["CARD-020D-MISSING-RUNTIME"]);
    expect(status).toMatchObject({
      blockerCodes: ["missing-runtime-capability"],
      componentEvidenceIds: ["on-play-draw"],
      missingCapabilityIds: ["effect:draw:self:count:positive-safe-integer"],
      parseStatus: "complete",
      status: "unsupported",
    });
    expect(status?.proofCertificate.playable).toBe(false);
    expect(status?.proofCertificate.supportChain[1]).toMatchObject({
      order: 2,
      status: "complete",
    });
    expect(status?.proofCertificate.supportChain[2]).toMatchObject({
      order: 3,
      status: "pass",
    });
    expect(status?.proofCertificate.supportChain[3]).toMatchObject({
      ids: ["on-play-draw"],
      order: 4,
      status: "present",
    });
    expect(status?.proofCertificate.supportChain[4]?.ids).toEqual(
      expect.arrayContaining([
        "category:auto",
        "effect:draw:self:count:positive-safe-integer",
      ]),
    );
    expect(status?.proofCertificate.supportChain[5]).toMatchObject({
      missingIds: ["effect:draw:self:count:positive-safe-integer"],
      order: 6,
      status: "missing",
    });
    expect(status?.proofCertificate.supportChain[6]).toMatchObject({
      order: 7,
      status: "missing",
    });
    expect(status?.proofCertificate.supportChain[7]).toMatchObject({
      order: 8,
      status: "no",
    });
  });

  it("carries scanner-derived structured diagnostics for arbitrary unsupported parser failures", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020B-SUPERNOVAS" as CardId,
          sourceText:
            "[On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.",
          sourceTextHash: "sha256:card-020b-supernovas",
        },
      ],
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport(index);
    const status = report.statusByCardId["CARD-020B-SUPERNOVAS"];
    const diagnosticComponents = status?.diagnosticComponents ?? [];

    expect(report.supportedCardIds).toEqual([]);
    expect(report.unsupportedCardIds).toEqual(["CARD-020B-SUPERNOVAS"]);
    expect(status).toMatchObject({
      blockerCodes: ["unparsed-span"],
      parseStatus: "partial",
      status: "unsupported",
    });
    expect(diagnosticComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentPath: "wrapper:on-play",
          kind: "wrapper",
          normalizedText: "[On Play]",
          status: "recognized",
        }),
        expect.objectContaining({
          componentPath: "condition:named-character:absent",
          kind: "condition",
          normalizedText: "you have no other [Cavendish] Characters",
          status: "unsupported",
        }),
        expect.objectContaining({
          componentPath: "action:set-active",
          kind: "action",
          status: "unsupported",
        }),
      ]),
    );
    expect(report.blockers[0]).not.toHaveProperty("deepestSuccessfulLayer");
  });

  it.each([
    {
      cardId: "CARD-020C-SUPERNOVAS" as CardId,
      expectedPaths: [
        "wrapper:on-play",
        "wrapper:when-attacking",
        "condition:leader-type",
        "condition:named-character:absent",
        "action:set-active",
      ],
      sourceText:
        "[On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.",
    },
    {
      cardId: "CARD-020C-KO-SEQUENCE" as CardId,
      expectedPaths: [
        "wrapper:on-play",
        "wrapper:when-attacking",
        "modifier:cost:negative",
        "sequence-connector:then",
        "action:ko",
        "predicate:cost:eq",
      ],
      sourceText:
        "[On Play]/[When Attacking] Give up to 1 of your opponent's Characters -1 cost during this turn. Then, K.O. up to 1 of your opponent's Characters with a cost of 0.",
    },
    {
      cardId: "CARD-020C-CONDITIONAL-DRAW" as CardId,
      expectedPaths: [],
      expectedStatus: "supported",
      sourceText:
        "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand, draw 2 cards.",
    },
    {
      cardId: "CARD-020C-BOTTOM-DECK" as CardId,
      expectedPaths: [
        "wrapper:on-play",
        "cardinality:up-to",
        "target:opponent-characters",
        "predicate:power:lte",
        "destination:owner-deck-bottom",
      ],
      sourceText:
        "[On Play] Place up to 1 of your opponent's Characters with 1000 power or less at the bottom of the owner's deck.",
    },
  ])(
    "reports structured representative diagnostics for $cardId",
    ({ cardId, expectedPaths, expectedStatus = "unsupported", sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId,
            sourceText,
            sourceTextHash: `sha256:${String(cardId).toLowerCase()}`,
          },
        ],
        validateEffectDefinition,
      });

      const report = buildGeneratedSupportReport(index);
      const status = report.statusByCardId[String(cardId)];
      if (expectedStatus === "supported") {
        expect(status).toMatchObject({
          blockerCodes: [],
          parseStatus: "complete",
          status: "supported",
        });
        expect(report.supportedCardIds).toEqual([cardId]);
        expect(report.unsupportedCardIds).toEqual([]);
        return;
      }
      expect(status).toMatchObject({
        blockerCodes: ["unparsed-span"],
        parseStatus: "partial",
        status: "unsupported",
      });
      const paths =
        status?.diagnosticComponents?.map(
          (component) => component.componentPath,
        ) ?? [];
      expect(paths).toEqual(expect.arrayContaining(expectedPaths));
    },
  );
});
