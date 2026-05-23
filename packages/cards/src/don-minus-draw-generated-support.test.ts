import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import type {
  CardId,
  EffectDefinition,
  EffectDefinitionMetadata,
  PoneglyphCardDetail,
} from "@optcg/types";

import {
  parseCertifiedCardText,
  onPlayDrawNParserRuleId,
} from "./certified-card-text-parser.js";
import {
  buildGeneratedSupportIndex,
  type EffectDefinitionValidationResult,
  type GeneratedSupportIndexEntry,
} from "./generated-support-index.js";
import {
  buildGeneratedSupportProofCertificate,
  buildGeneratedSupportReport,
} from "./generated-support-report.js";
import {
  isCompleteGeneratedSupportParseResult,
  listComponentEvidenceIdsForParserRuleIds,
} from "./generated-support-types.js";
import { normalizePoneglyphCardDetail } from "./normalization.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";
import { donMinusDrawParserCertificationIds } from "./don-minus-draw-evidence.js";
import {
  returnDonCostWrapperComponentEvidenceId,
  returnDonCostWrapperParserRuleId,
} from "./return-don-cost-wrapper-components.js";
import { runSupportProbe } from "./support-probe.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const schema = JSON.parse(
  readFileSync(path.join(repoRoot, "contracts/effect-dsl.schema.json"), "utf8"),
) as unknown;
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema as AnySchema);

const donMinusDrawParserRuleId = "exact:on-play:return-don-draw-n:self";
const donMinusDrawComponentEvidenceId = "on-play-return-don-then-draw";
const syntheticCardId = "SUP-001D-SYNTHETIC" as CardId;
const supportedSourceText = "[On Play] DON!! -2: Draw 3 cards.";
const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  cardId: syntheticCardId,
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceText: supportedSourceText,
  sourceTextHash: "sha256:source",
};

const validateEffectDefinition = (
  definition: EffectDefinition,
): EffectDefinitionValidationResult => {
  const valid = validateSchema(definition);
  return valid
    ? { valid: true }
    : {
        errors: (validateSchema.errors ?? []).map((error) =>
          `${error.instancePath || "/"} ${error.message ?? ""}`.trim(),
        ),
        valid: false,
      };
};

describe("SUP-001D DON-minus draw generated support", () => {
  const allDonMinusCertifications =
    donMinusDrawParserCertificationIds as readonly string[];

  it("supports synthetic On Play DON-minus draw with generic DON and draw counts", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        baseCard,
        {
          ...baseCard,
          cardId: "SUP-001D-SYNTHETIC-ALT" as CardId,
          sourceText: "[On Play] DON!! -12: Draw 4 cards.",
          sourceTextHash: "sha256:source-alt",
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: allDonMinusCertifications,
      },
      validateEffectDefinition,
    });

    expect(index.entries.map((entry) => entry.status)).toEqual([
      "supported",
      "supported",
    ]);
    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: syntheticCardId,
      componentEvidenceIds: [
        "on-play-draw",
        donMinusDrawComponentEvidenceId,
        returnDonCostWrapperComponentEvidenceId,
      ],
      parseStatus: "complete",
      parserRuleIds: [
        returnDonCostWrapperParserRuleId,
        onPlayDrawNParserRuleId,
        donMinusDrawParserRuleId,
      ],
      status: "supported",
      support: {
        cardId: syntheticCardId,
        effectDefinitionId: "sup-001d-synthetic.generated-support",
        status: "implemented-dsl",
        tested: true,
      },
    });
    expect(index.entries[0]?.effectDefinition?.effects[0]).toEqual({
      category: "auto",
      cost: { chooser: "self", count: 2, type: "returnDon" },
      effect: { count: 3, player: "self", type: "draw" },
      id: "SUP-001D-SYNTHETIC:auto-on-play-return-don-2-draw-3",
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    });
    expect(index.entries[1]?.effectDefinition?.effects[0]).toMatchObject({
      cost: { chooser: "self", count: 12, type: "returnDon" },
      effect: { count: 4, player: "self", type: "draw" },
    });
  });

  it("reports complete support proof only when every component capability is present", () => {
    const supportedIndex = buildGeneratedSupportIndex({
      cards: [baseCard],
      parserCertificationEvidence: {
        currentCertificationIds: allDonMinusCertifications,
      },
      validateEffectDefinition,
    });
    const missingCostCapabilityIndex = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "SUP-001D-MISSING-CAPABILITY" as CardId,
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: allDonMinusCertifications,
      },
      runtimeCapabilityMatrix: withoutCapability(
        "returnDon:cost:self:count-exact",
      ),
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport({
      effectDefinitions: supportedIndex.effectDefinitions,
      entries: [
        ...supportedIndex.entries,
        ...missingCostCapabilityIndex.entries,
      ],
    });

    expect(report.supportedCardIds).toEqual([syntheticCardId]);
    expect(report.unsupportedCardIds).toEqual(["SUP-001D-MISSING-CAPABILITY"]);
    expect(report.parserRuleIdsUsed).toEqual([
      returnDonCostWrapperParserRuleId,
      onPlayDrawNParserRuleId,
      donMinusDrawParserRuleId,
    ]);
    expect(report.componentEvidenceIdsUsed).toEqual([
      "on-play-draw",
      donMinusDrawComponentEvidenceId,
      returnDonCostWrapperComponentEvidenceId,
    ]);
    expect(report.proofCertificatesByCardId[syntheticCardId]).toMatchObject({
      componentEvidenceIds: [
        "on-play-draw",
        donMinusDrawComponentEvidenceId,
        returnDonCostWrapperComponentEvidenceId,
      ],
      finalPlayableDecision: "yes",
      missingRuntimeCapabilityIds: [],
      requiredRuntimeCapabilityIds: [
        "category:auto",
        "effect:draw:self:count:positive-safe-integer",
        "payCost:returnDon:self:count-exact",
        "returnDon:cost:self:count-exact",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
    });
    expect(report.blockers).toEqual([
      {
        capabilityId: "returnDon:cost:self:count-exact",
        cardId: "SUP-001D-MISSING-CAPABILITY",
        code: "missing-runtime-capability",
        component: donMinusDrawComponentEvidenceId,
        deepestSuccessfulLayer: "schema",
        layer: "runtime-capability",
        message:
          "Missing runtime capability returnDon:cost:self:count-exact for component on-play-return-don-then-draw.",
      },
      {
        capabilityId: "returnDon:cost:self:count-exact",
        cardId: "SUP-001D-MISSING-CAPABILITY",
        code: "missing-runtime-capability",
        component: returnDonCostWrapperComponentEvidenceId,
        deepestSuccessfulLayer: "schema",
        layer: "runtime-capability",
        message:
          "Missing runtime capability returnDon:cost:self:count-exact for component return-don-cost-wrapper.",
      },
    ]);
  });

  it.each(allDonMinusCertifications)(
    "fails closed when DON-minus certification boundary is missing: %s",
    (missingCertificationId) => {
      const index = buildGeneratedSupportIndex({
        cards: [baseCard],
        parserCertificationEvidence: {
          currentCertificationIds: allDonMinusCertifications.filter(
            (id) => id !== missingCertificationId,
          ),
        },
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        parseStatus: "complete",
        status: "unsupported",
      });
      expect(index.entries[0]?.blockers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "unsupported-primitive",
            component: donMinusDrawComponentEvidenceId,
            diagnosticLayer: "review",
          }),
        ]),
      );
      expect(
        index.entries[0]?.blockers.some((blocker) =>
          blocker.message.includes(
            `Missing parser certification ${missingCertificationId}`,
          ),
        ),
      ).toBe(true);
    },
  );

  it("prints support-probe certificate evidence for complete DON-minus draw", async () => {
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: syntheticCardId,
      getCard: () => Promise.resolve(syntheticCardDetail(supportedSourceText)),
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
    expect(text).toContain("sup-001d-synthetic.generated-support");
    expect(text).toContain(
      "- parser-rule certification/evidence: passed (component:cost:return-don:self:count-exact, exact:on-play:draw-n:self, exact:on-play:return-don-draw-n:self)",
    );
    expect(text).toContain(
      "- component evidence IDs: passed (on-play-draw, on-play-return-don-then-draw, return-don-cost-wrapper)",
    );
    expect(text).toContain(
      "- required runtime capability IDs: passed (category:auto, effect:draw:self:count:positive-safe-integer, payCost:returnDon:self:count-exact, returnDon:cost:self:count-exact, sourcePresencePolicy:mustRemainInSameZone, trigger:onPlay)",
    );
    expect(text).toContain("- missing runtime capability IDs: passed (none)");
    expect(text).toContain("- final playable decision: yes");
    expect(text).toContain("Blockers: none");
  });

  it.each([
    {
      expectedSpan: "[On Play] DON!! -0: Draw 1 card.",
      sourceText: "[On Play] DON!! -0: Draw 1 card.",
    },
    {
      expectedSpan: "[On Play] DON!! -1 Draw 1 card.",
      sourceText: "[On Play] DON!! -1 Draw 1 card.",
    },
    {
      expectedSpan: "[On Play] DON!! -1: Rest up to 1 DON!! card.",
      sourceText: "[On Play] DON!! -1: Rest up to 1 DON!! card.",
    },
  ])(
    "keeps malformed cost wrappers and unsupported bodies not playable ($sourceText)",
    ({ expectedSpan, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseCard,
            sourceText,
          },
        ],
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [
          {
            code: "unparsed-span",
            span: { text: expectedSpan },
          },
        ],
        parseStatus: "partial",
        status: "unsupported",
      });
      expect(index.entries[0]?.support).toBeUndefined();
      expect(index.effectDefinitions).toEqual({});
    },
  );

  it("keeps stale source and behavior hashes fail-closed for DON-minus draw", () => {
    const staleSourceIndex = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          expectedSourceTextHash: "sha256:old-source",
        },
      ],
      validateEffectDefinition,
    });
    const normalized = normalizePoneglyphCardDetail(
      syntheticCardDetail(supportedSourceText),
    );
    const staleBehaviorCertificate = buildGeneratedSupportProofCertificate({
      behaviorHash: normalized.behaviorHash,
      blockers: [
        {
          code: "stale-hash",
          expectedHash: "sha256:old-behavior",
          message: "Poneglyph behavior hash changed.",
          receivedHash: normalized.behaviorHash,
        },
      ],
      capabilityEvidence: [],
      cardId: normalized.cardId,
      componentEvidenceIds: [],
      missingCapabilityIds: [],
      parseStatus: "staleHash",
      parserRuleIds: [],
      sourceTextHash: normalized.sourceTextHash,
      status: "unsupported",
    });

    expect(staleSourceIndex.entries[0]).toMatchObject({
      blockers: [
        {
          code: "stale-hash",
          expectedHash: "sha256:old-source",
          message: "Poneglyph text hash changed.",
          receivedHash: "sha256:source",
        },
      ],
      parseStatus: "staleHash",
      status: "unsupported",
    });
    expect(staleBehaviorCertificate.finalPlayableDecision).toBe("no");
    expect(staleBehaviorCertificate.chain).toContainEqual(
      expect.objectContaining({
        layer: "behavior-hash",
        status: "failed",
      }),
    );
  });

  it("keeps missing support metadata, review, and tested gates from making DON-minus draw playable", () => {
    const entry = requireSupportedEntry();
    const effectDefinition = requireEffectDefinition(entry);
    const metadataWithoutReview = omitReviewMetadata(effectDefinition.metadata);
    const { support, ...withoutSupport } = entry;
    void support;
    const certificate = buildGeneratedSupportProofCertificate({
      ...withoutSupport,
      effectDefinition: {
        ...effectDefinition,
        metadata: {
          ...metadataWithoutReview,
          tested: false,
        },
      },
      status: "supported",
    });

    expect(certificate.finalPlayableDecision).toBe("no");
    expect(certificate.chain).toEqual(
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

  it("preserves existing draw and return-DON play-selected generated support behavior", () => {
    const draw = parseCertifiedCardText({
      cardId: "SUP-001D-DRAW-REGRESSION" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText: "[On Play] Draw 5 cards.",
      sourceTextHash: "sha256:draw",
    });
    const playSelected = parseCertifiedCardText({
      cardId: "SUP-001D-PLAY-SELECTED-REGRESSION" as CardId,
      effectDefinitionsVersion: "effects-v1",
      rulesVersion: "rules-v1",
      sourceText:
        "[On Play] DON!! -2: Select up to 1 Character card from your hand and play it.",
      sourceTextHash: "sha256:play-selected",
    });

    expect(draw.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(draw)) {
      throw new Error("Expected complete On Play draw parse.");
    }
    expect(draw.parserRuleIds).toEqual([onPlayDrawNParserRuleId]);
    expect(draw.effectDefinition.effects[0]?.effect).toEqual({
      count: 5,
      player: "self",
      type: "draw",
    });

    expect(playSelected.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(playSelected)) {
      throw new Error("Expected complete return-DON play-selected parse.");
    }
    expect(playSelected.parserRuleIds).toEqual([
      "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
    ]);
    expect(playSelected.effectDefinition.effects[0]?.effect).toMatchObject({
      type: "sequence",
    });
  });

  it("certifies DON-minus draw parser and component evidence without exact production branches", () => {
    expect(
      listComponentEvidenceIdsForParserRuleIds([
        donMinusDrawParserRuleId,
        onPlayDrawNParserRuleId,
        returnDonCostWrapperParserRuleId,
      ]),
    ).toEqual([
      "on-play-draw",
      donMinusDrawComponentEvidenceId,
      returnDonCostWrapperComponentEvidenceId,
    ]);
    for (const capabilityId of [
      "category:auto",
      "effect:draw:self:count:positive-safe-integer",
      "payCost:returnDon:self:count-exact",
      "returnDon:cost:self:count-exact",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ]) {
      const capability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );
      expect(capability?.supportedParserRuleIds).toContain(
        donMinusDrawParserRuleId,
      );
    }

    const productionSource = [
      "certified-card-text-parser.ts",
      "composed-parser-builder.ts",
      "don-minus-draw-components.ts",
      "don-minus-draw-evidence.ts",
      "generated-support-index.ts",
      "generated-support-report.ts",
      "generated-support-types.ts",
      "parser-rule-id-components.ts",
      "runtime-capability-matrix.ts",
    ]
      .map((fileName) =>
        readFileSync(
          path.join(repoRoot, "packages", "cards", "src", fileName),
          "utf8",
        ),
      )
      .join("\n");
    expect(productionSource).not.toMatch(/\bOP\d{2}-\d{3}\b/);
    expect(productionSource).not.toContain(supportedSourceText);
    expect(productionSource).not.toContain("DON!! -1: Draw 1 card.");
  });
});

function withoutCapability(capabilityId: string) {
  return {
    ...generatedSupportRuntimeCapabilityMatrix,
    capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
      (capability) => capability.id !== capabilityId,
    ),
  };
}

function requireSupportedEntry(): GeneratedSupportIndexEntry {
  const entry = buildGeneratedSupportIndex({
    cards: [baseCard],
    parserCertificationEvidence: {
      currentCertificationIds: donMinusDrawParserCertificationIds,
    },
    validateEffectDefinition,
  }).entries[0];
  if (entry === undefined || entry.status !== "supported") {
    throw new Error("Expected supported SUP-001D entry.");
  }
  return entry;
}

function requireEffectDefinition(
  entry: GeneratedSupportIndexEntry,
): EffectDefinition {
  const effectDefinition = entry.effectDefinition;
  if (effectDefinition === undefined) {
    throw new Error("Expected generated effect definition.");
  }
  return effectDefinition;
}

function omitReviewMetadata(
  metadata: EffectDefinitionMetadata,
): Omit<EffectDefinitionMetadata, "reviewedBy" | "reviewer"> {
  const { reviewedBy, reviewer, ...withoutReview } = metadata;
  void reviewedBy;
  void reviewer;
  return withoutReview;
}

function syntheticCardDetail(effect: string): PoneglyphCardDetail {
  return {
    attribute: ["Special"],
    available_languages: ["en"],
    block: null,
    card_number: syntheticCardId,
    card_type: "Character",
    color: ["Red"],
    cost: 3,
    counter: 1000,
    effect,
    language: "en",
    legality: {},
    life: null,
    name: syntheticCardId,
    official_faq: [],
    power: 5000,
    rarity: null,
    released: true,
    released_at: null,
    set: "SYNTHETIC",
    set_name: "Synthetic SUP-001D Tests",
    trigger: null,
    types: ["Synthetic"],
    variants: [],
  };
}
