import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinitionMetadata } from "@optcg/types";

import {
  buildGeneratedSupportIndex,
  type GeneratedSupportIndexEntry,
  type RuntimeCapabilityEvidence,
} from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";
import { listAllGeneratedSupportParserCertificationIds } from "./generated-support-types.js";

const baseInput = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
};

const validateEffectDefinition = () => ({ valid: true }) as const;
const parserCertificationEvidence = {
  currentCertificationIds: listAllGeneratedSupportParserCertificationIds(),
} as const;

describe("generated support proof certificates", () => {
  it("emits structured proof certificate data with the support chain in order", () => {
    const report = buildGeneratedSupportReport(
      buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId: "CARD-020D-SUPPORTED" as CardId,
            sourceText: "[On Play] Draw 1 card.",
            sourceTextHash: "sha256:card-020d-supported",
          },
        ],
        parserCertificationEvidence,
        validateEffectDefinition,
      }),
    );

    const certificate = report.proofCertificatesByCardId["CARD-020D-SUPPORTED"];

    expect(certificate?.chain.map((layer) => layer.layer)).toEqual([
      "source-hash",
      "behavior-hash",
      "parse-completeness",
      "parser-rule-certification",
      "generated-dsl-schema",
      "component-evidence",
      "required-runtime-capabilities",
      "missing-runtime-capabilities",
      "engine-proof-test-evidence",
      "support-metadata",
      "review-state",
      "tested-state",
      "final-playable-decision",
    ]);
    expect(certificate).toMatchObject({
      componentEvidenceIds: ["on-play-draw"],
      finalPlayableDecision: "yes",
      missingRuntimeCapabilityIds: [],
      parserRuleIds: ["exact:on-play:draw-n:self"],
      requiredRuntimeCapabilityIds: [
        "category:auto",
        "effect:draw:self:count:positive-safe-integer",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
    });
  });

  it("reports parse, schema, and component success while missing runtime capability keeps final playable no", () => {
    const matrixWithoutDraw = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "effect:draw:self:count:positive-safe-integer",
      ),
    };
    const report = buildGeneratedSupportReport(
      buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId: "CARD-020D-MISSING-RUNTIME" as CardId,
            sourceText: "[On Play] Draw 1 card.",
            sourceTextHash: "sha256:card-020d-missing-runtime",
          },
        ],
        runtimeCapabilityMatrix: matrixWithoutDraw,
        parserCertificationEvidence,
        validateEffectDefinition,
      }),
    );

    const certificate =
      report.proofCertificatesByCardId["CARD-020D-MISSING-RUNTIME"];

    expect(certificate).toMatchObject({
      componentEvidenceIds: ["on-play-draw"],
      finalPlayableDecision: "no",
      missingRuntimeCapabilityIds: [
        "effect:draw:self:count:positive-safe-integer",
      ],
      parserRuleIds: ["exact:on-play:draw-n:self"],
    });
    expect(certificate?.chain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layer: "parse-completeness",
          status: "passed",
        }),
        expect.objectContaining({
          layer: "generated-dsl-schema",
          status: "passed",
        }),
        expect.objectContaining({
          layer: "component-evidence",
          status: "passed",
        }),
        expect.objectContaining({
          layer: "missing-runtime-capabilities",
          status: "failed",
        }),
      ]),
    );
  });

  it("reports missing engine proof/test evidence as a proof layer and final playable no", () => {
    const supported = buildSupportedDrawIndex(
      "CARD-020D-MISSING-ENGINE-PROOF" as CardId,
    );
    const entry = requireOnlyEntry(supported.entries);
    const entryWithoutEngineProof: GeneratedSupportIndexEntry = {
      ...entry,
      capabilityEvidence: entry.capabilityEvidence.filter(
        (evidence) =>
          evidence.capabilityId !==
          "effect:draw:self:count:positive-safe-integer",
      ),
    };

    const certificate = buildGeneratedSupportReport({
      effectDefinitions: supported.effectDefinitions,
      entries: [entryWithoutEngineProof],
    }).proofCertificatesByCardId["CARD-020D-MISSING-ENGINE-PROOF"];

    expect(certificate).toMatchObject({
      finalPlayableDecision: "no",
      missingEngineProofRuntimeCapabilityIds: [
        "effect:draw:self:count:positive-safe-integer",
      ],
      missingRuntimeCapabilityIds: [],
    });
    expect(certificate?.chain).toContainEqual(
      expect.objectContaining({
        layer: "engine-proof-test-evidence",
        status: "missing",
      }),
    );
  });

  it("reports missing parser-rule certification as a proof layer and final playable no", () => {
    const supported = buildSupportedDrawIndex(
      "CARD-020D-MISSING-PARSER-CERT" as CardId,
    );
    const entryWithoutParserCertification: GeneratedSupportIndexEntry = {
      ...requireOnlyEntry(supported.entries),
      parserRuleIds: [],
    };

    const certificate = buildGeneratedSupportReport({
      effectDefinitions: supported.effectDefinitions,
      entries: [entryWithoutParserCertification],
    }).proofCertificatesByCardId["CARD-020D-MISSING-PARSER-CERT"];

    expect(certificate).toMatchObject({
      finalPlayableDecision: "no",
      parserRuleIds: [],
    });
    expect(certificate?.chain).toContainEqual(
      expect.objectContaining({
        layer: "parser-rule-certification",
        status: "missing",
      }),
    );
  });

  it("reports missing support metadata, review state, and tested state as independent proof gates", () => {
    const supported = buildSupportedDrawIndex(
      "CARD-020D-MISSING-GATES" as CardId,
    );
    const entry = requireOnlyEntry(supported.entries);
    const effectDefinition = entry.effectDefinition;
    if (effectDefinition === undefined) {
      throw new Error("expected generated effect definition for test entry");
    }

    const metadataWithoutReview = omitReviewMetadata(effectDefinition.metadata);
    const { support, ...entryWithoutSupport } = entry;
    void support;
    const entryWithoutSupportGates: GeneratedSupportIndexEntry = {
      ...entryWithoutSupport,
      effectDefinition: {
        ...effectDefinition,
        metadata: {
          ...metadataWithoutReview,
          tested: false,
        },
      },
    };

    const certificate = buildGeneratedSupportReport({
      effectDefinitions: {},
      entries: [entryWithoutSupportGates],
    }).proofCertificatesByCardId["CARD-020D-MISSING-GATES"];

    expect(certificate?.finalPlayableDecision).toBe("no");
    expect(certificate?.chain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layer: "support-metadata",
          status: "missing",
        }),
        expect.objectContaining({
          layer: "review-state",
          status: "missing",
        }),
        expect.objectContaining({
          layer: "tested-state",
          status: "failed",
        }),
      ]),
    );
  });

  it("keeps scanner, parser, component, and schema discovery from creating playable support independently", () => {
    const report = buildGeneratedSupportReport({
      effectDefinitions: {},
      entries: [
        buildCertificateOnlyEntry({
          cardId: "CARD-020D-SCANNER-ONLY" as CardId,
          parseStatus: "partial",
        }),
        buildCertificateOnlyEntry({
          cardId: "CARD-020D-PARSER-ONLY" as CardId,
          componentEvidenceIds: [],
          parseStatus: "complete",
          parserRuleIds: ["exact:on-play:draw-n:self"],
        }),
        buildCertificateOnlyEntry({
          cardId: "CARD-020D-COMPONENT-ONLY" as CardId,
          componentEvidenceIds: ["on-play-draw"],
          parseStatus: "complete",
          parserRuleIds: [],
        }),
        buildCertificateOnlyEntry({
          cardId: "CARD-020D-SCHEMA-ONLY" as CardId,
          capabilityEvidence: [],
          componentEvidenceIds: ["on-play-draw"],
          parseStatus: "complete",
          parserRuleIds: ["exact:on-play:draw-n:self"],
        }),
      ],
    });

    expect(
      Object.values(report.proofCertificatesByCardId).map(
        (certificate) => certificate.finalPlayableDecision,
      ),
    ).toEqual(["no", "no", "no", "no"]);
    expect(report.supportedCardIds).toEqual([]);
  });

  it("preserves blocker code identities in proof-reporting entries", () => {
    const blockerCodes = [
      "stale-hash",
      "invalid-dsl-schema",
      "missing-runtime-capability",
      "unsupported-primitive",
      "custom-handler-required",
      "ambiguous-wording",
      "unparsed-span",
    ] as const;

    const report = buildGeneratedSupportReport({
      effectDefinitions: {},
      entries: blockerCodes.map((code) => ({
        ...buildCertificateOnlyEntry({
          cardId: `CARD-020D-${code}` as CardId,
          parseStatus: code === "stale-hash" ? "staleHash" : "partial",
        }),
        blockers: [
          {
            code,
            message: `Proof reporting preserves ${code}.`,
          },
        ],
      })),
    });

    expect(report.blockers.map((blocker) => blocker.code).sort()).toEqual([
      "ambiguous-wording",
      "custom-handler-required",
      "invalid-dsl-schema",
      "missing-runtime-capability",
      "stale-hash",
      "unparsed-span",
      "unsupported-primitive",
    ]);
  });
});

function buildSupportedDrawIndex(cardId: CardId) {
  return buildGeneratedSupportIndex({
    cards: [
      {
        ...baseInput,
        cardId,
        sourceText: "[On Play] Draw 1 card.",
        sourceTextHash: `sha256:${String(cardId).toLowerCase()}`,
      },
    ],
    parserCertificationEvidence,
    validateEffectDefinition,
  });
}

function requireOnlyEntry(
  entries: readonly GeneratedSupportIndexEntry[],
): GeneratedSupportIndexEntry {
  const entry = entries[0];
  if (entry === undefined || entries.length !== 1) {
    throw new Error("expected exactly one generated-support index entry");
  }
  return entry;
}

function buildCertificateOnlyEntry({
  capabilityEvidence = [],
  cardId,
  componentEvidenceIds = [],
  parseStatus,
  parserRuleIds = [],
}: {
  capabilityEvidence?: readonly RuntimeCapabilityEvidence[];
  cardId: CardId;
  componentEvidenceIds?: readonly string[];
  parseStatus: GeneratedSupportIndexEntry["parseStatus"];
  parserRuleIds?: readonly string[];
}): GeneratedSupportIndexEntry {
  return {
    blockers: [],
    capabilityEvidence,
    cardId,
    componentEvidenceIds,
    missingCapabilityIds: [],
    parseStatus,
    parserRuleIds,
    sourceTextHash: "sha256:certificate-only",
    status: "unsupported",
  };
}

function omitReviewMetadata(
  metadata: EffectDefinitionMetadata,
): Omit<EffectDefinitionMetadata, "reviewedBy" | "reviewer"> {
  const { reviewedBy, reviewer, ...withoutReview } = metadata;
  void reviewedBy;
  void reviewer;
  return withoutReview;
}
