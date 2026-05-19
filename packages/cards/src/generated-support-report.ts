import type { CardId } from "@optcg/types";

import type {
  GeneratedSupportIndex,
  GeneratedSupportIndexEntry,
  RuntimeCapabilityEvidence,
} from "./generated-support-index.js";
import type {
  GeneratedSupportBlockerCode,
  GeneratedSupportDeepestSuccessfulLayer,
  GeneratedSupportDiagnosticLayer,
  GeneratedSupportParserResultStatus,
  GeneratedSupportBlocker,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";
import { listRequiredRuntimeCapabilityIdsForComponentEvidenceId } from "./generated-support-types.js";

export const generatedSupportProofCertificateLayers = [
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
] as const;

export type GeneratedSupportProofCertificateLayerName =
  (typeof generatedSupportProofCertificateLayers)[number];

export type GeneratedSupportProofCertificateLayerStatus =
  | "passed"
  | "failed"
  | "missing"
  | "unavailable"
  | "not-applicable";

export interface GeneratedSupportProofCertificateLayer {
  layer: GeneratedSupportProofCertificateLayerName;
  status: GeneratedSupportProofCertificateLayerStatus;
  message: string;
  evidenceIds?: readonly string[];
  capabilityIds?: readonly string[];
  missingCapabilityIds?: readonly string[];
}

export interface GeneratedSupportProofCertificate {
  cardId: CardId;
  chain: readonly GeneratedSupportProofCertificateLayer[];
  componentEvidenceIds: readonly string[];
  finalPlayableDecision: "yes" | "no";
  missingEngineProofRuntimeCapabilityIds: readonly string[];
  missingRuntimeCapabilityIds: readonly string[];
  parserRuleIds: readonly string[];
  requiredRuntimeCapabilityIds: readonly string[];
}

export interface GeneratedSupportReport {
  blockerCount: number;
  blockers: readonly GeneratedSupportReportBlocker[];
  componentEvidenceIdsUsed: readonly string[];
  missingRuntimeCapabilityIds: readonly string[];
  parserRuleIdsUsed: readonly string[];
  proofCertificatesByCardId: Record<string, GeneratedSupportProofCertificate>;
  statusByCardId: Record<string, GeneratedSupportReportCardStatus>;
  supportedCardIds: readonly CardId[];
  totalCards: number;
  unparsedSpans: readonly GeneratedSupportReportUnparsedSpan[];
  unsupportedCardIds: readonly CardId[];
  unsupportedPrimitiveComponents: readonly string[];
}

export interface GeneratedSupportReportBlocker {
  cardId: CardId;
  code: GeneratedSupportBlockerCode;
  deepestSuccessfulLayer?: GeneratedSupportDeepestSuccessfulLayer;
  layer: GeneratedSupportDiagnosticLayer;
  message: string;
  capabilityId?: string;
  component?: string;
  decomposition?: GeneratedSupportBlocker["decomposition"];
  expectedHash?: string;
  parserRuleId?: string;
  receivedHash?: string;
  span?: GeneratedSupportUnparsedSpan;
}

export interface GeneratedSupportReportCardStatus {
  blockerCodes: readonly GeneratedSupportBlockerCode[];
  componentEvidenceIds: readonly string[];
  missingCapabilityIds: readonly string[];
  parseStatus: GeneratedSupportParserResultStatus;
  parserRuleIds: readonly string[];
  status: "supported" | "unsupported";
}

export interface GeneratedSupportReportUnparsedSpan extends GeneratedSupportUnparsedSpan {
  cardId: CardId;
}

export interface GeneratedSupportProofCertificateInput {
  blockers: readonly GeneratedSupportBlocker[];
  capabilityEvidence: readonly RuntimeCapabilityEvidence[];
  cardId: CardId;
  componentEvidenceIds: readonly string[];
  effectDefinition?: GeneratedSupportIndexEntry["effectDefinition"];
  missingCapabilityIds: readonly string[];
  parseStatus: GeneratedSupportParserResultStatus;
  parserRuleIds: readonly string[];
  sourceTextHash: string;
  status: "supported" | "unsupported";
  behaviorHash?: string;
  support?: GeneratedSupportIndexEntry["support"];
}

export function buildGeneratedSupportReport(
  index: GeneratedSupportIndex,
): GeneratedSupportReport {
  const entries = [...index.entries].sort((left, right) =>
    String(left.cardId).localeCompare(String(right.cardId)),
  );
  const blockers = entries
    .flatMap((entry) =>
      entry.blockers.map((blocker): GeneratedSupportReportBlocker => {
        const publicBlocker = stripInternalBlockerFields(blocker);
        const deepestSuccessfulLayer =
          determineDeepestSuccessfulLayerForBlocker(blocker);
        return {
          ...publicBlocker,
          cardId: entry.cardId,
          ...(deepestSuccessfulLayer === undefined
            ? {}
            : { deepestSuccessfulLayer }),
          layer: classifyGeneratedSupportBlockerLayer(blocker),
        };
      }),
    )
    .sort(compareBlockers);

  return {
    blockerCount: blockers.length,
    blockers,
    componentEvidenceIdsUsed: sortedUnique(
      entries.flatMap((entry) => entry.componentEvidenceIds),
    ),
    missingRuntimeCapabilityIds: sortedUnique(
      entries.flatMap((entry) => entry.missingCapabilityIds),
    ),
    parserRuleIdsUsed: sortedUnique(
      entries.flatMap((entry) => entry.parserRuleIds),
    ),
    proofCertificatesByCardId: Object.fromEntries(
      entries.map((entry) => [
        entry.cardId,
        buildGeneratedSupportProofCertificate(entry),
      ]),
    ),
    statusByCardId: Object.fromEntries(
      entries.map((entry) => [
        entry.cardId,
        {
          blockerCodes: sortedUnique(
            entry.blockers.map((blocker) => blocker.code),
          ),
          componentEvidenceIds: sortedUnique(entry.componentEvidenceIds),
          missingCapabilityIds: sortedUnique(entry.missingCapabilityIds),
          parseStatus: entry.parseStatus,
          parserRuleIds: sortedUnique(entry.parserRuleIds),
          status: entry.status,
        } satisfies GeneratedSupportReportCardStatus,
      ]),
    ),
    supportedCardIds: entries
      .filter((entry) => entry.status === "supported")
      .map((entry) => entry.cardId),
    totalCards: entries.length,
    unparsedSpans: blockers
      .filter(
        (
          blocker,
        ): blocker is GeneratedSupportReportBlocker & {
          span: GeneratedSupportUnparsedSpan;
        } => blocker.span !== undefined,
      )
      .map((blocker) => ({
        cardId: blocker.cardId,
        ...blocker.span,
      }))
      .sort(compareUnparsedSpans),
    unsupportedCardIds: entries
      .filter((entry) => entry.status === "unsupported")
      .map((entry) => entry.cardId),
    unsupportedPrimitiveComponents: sortedUnique(
      blockers
        .filter(
          (
            blocker,
          ): blocker is GeneratedSupportReportBlocker & {
            component: string;
          } =>
            blocker.code === "unsupported-primitive" &&
            isUnsupportedPrimitiveComponentLayer(
              classifyGeneratedSupportBlockerLayer(blocker),
            ) &&
            blocker.component !== undefined,
        )
        .map((blocker) => blocker.component),
    ),
  };
}

export function buildGeneratedSupportProofCertificate(
  entry: GeneratedSupportProofCertificateInput,
): GeneratedSupportProofCertificate {
  const componentEvidenceIds = sortedUnique(entry.componentEvidenceIds);
  const parserRuleIds = sortedUnique(entry.parserRuleIds);
  const requiredRuntimeCapabilityIds = sortedUnique([
    ...componentEvidenceIds.flatMap((componentEvidenceId) =>
      listRequiredRuntimeCapabilityIdsForComponentEvidenceId(
        componentEvidenceId,
      ),
    ),
    ...entry.capabilityEvidence.map((evidence) => evidence.capabilityId),
    ...entry.missingCapabilityIds,
  ]);
  const missingRuntimeCapabilityIds = sortedUnique(entry.missingCapabilityIds);
  const engineProofRuntimeCapabilityIds = new Set(
    entry.capabilityEvidence.map((evidence) => evidence.capabilityId),
  );
  const missingRuntimeCapabilityIdSet = new Set(missingRuntimeCapabilityIds);
  const missingEngineProofRuntimeCapabilityIds =
    missingRuntimeCapabilityIds.length > 0
      ? []
      : requiredRuntimeCapabilityIds.filter(
          (capabilityId) => !engineProofRuntimeCapabilityIds.has(capabilityId),
        );

  const preliminaryChain = [
    buildSourceHashLayer(entry),
    buildBehaviorHashLayer(entry),
    buildParseCompletenessLayer(entry),
    buildParserRuleCertificationLayer({
      componentEvidenceIds,
      entry,
      parserRuleIds,
      requiredRuntimeCapabilityIds,
    }),
    buildGeneratedDslSchemaLayer(entry),
    buildComponentEvidenceLayer({ componentEvidenceIds, entry }),
    buildRequiredRuntimeCapabilitiesLayer({
      entry,
      requiredRuntimeCapabilityIds,
    }),
    buildMissingRuntimeCapabilitiesLayer(missingRuntimeCapabilityIds),
    buildEngineProofTestEvidenceLayer({
      missingEngineProofRuntimeCapabilityIds,
      missingRuntimeCapabilityIds,
      requiredRuntimeCapabilityIds,
    }),
    buildSupportMetadataLayer(entry),
    buildReviewStateLayer(entry),
    buildTestedStateLayer(entry),
  ] satisfies readonly GeneratedSupportProofCertificateLayer[];
  const finalPlayableDecision =
    entry.status === "supported" &&
    preliminaryChain.every((layer) => isPassingProofLayerStatus(layer.status))
      ? "yes"
      : "no";
  const finalLayer = {
    layer: "final-playable-decision",
    message:
      finalPlayableDecision === "yes"
        ? "All represented generated-support proof gates passed."
        : "Generated support remains fail-closed because at least one proof gate is missing, failed, or unavailable.",
    status: finalPlayableDecision === "yes" ? "passed" : "failed",
  } satisfies GeneratedSupportProofCertificateLayer;
  const chain = [...preliminaryChain, finalLayer];

  assertProofCertificateLayerOrder(chain);

  return {
    cardId: entry.cardId,
    chain,
    componentEvidenceIds,
    finalPlayableDecision,
    missingEngineProofRuntimeCapabilityIds,
    missingRuntimeCapabilityIds: missingRuntimeCapabilityIds.filter(
      (capabilityId) => missingRuntimeCapabilityIdSet.has(capabilityId),
    ),
    parserRuleIds,
    requiredRuntimeCapabilityIds,
  };
}

function buildSourceHashLayer(
  entry: GeneratedSupportProofCertificateInput,
): GeneratedSupportProofCertificateLayer {
  if (hasStaleSourceHashBlocker(entry.blockers)) {
    return {
      layer: "source-hash",
      message: "Reviewed source-text hash evidence is stale.",
      status: "failed",
    };
  }

  if (entry.sourceTextHash.length === 0) {
    return {
      layer: "source-hash",
      message: "Source-text hash evidence is missing.",
      status: "missing",
    };
  }

  return {
    evidenceIds: [entry.sourceTextHash],
    layer: "source-hash",
    message: "Source-text hash evidence is present and not stale.",
    status: "passed",
  };
}

function buildBehaviorHashLayer(
  entry: GeneratedSupportProofCertificateInput,
): GeneratedSupportProofCertificateLayer {
  if (hasStaleBehaviorHashBlocker(entry.blockers)) {
    return {
      layer: "behavior-hash",
      message: "Reviewed behavior hash evidence is stale.",
      status: "failed",
    };
  }

  const behaviorHash = entry.behaviorHash ?? entry.support?.behaviorHash;
  if (behaviorHash === undefined || behaviorHash.length === 0) {
    return {
      layer: "behavior-hash",
      message:
        "Behavior hash evidence is not represented in this generated-support report entry.",
      status: "missing",
    };
  }

  return {
    evidenceIds: [behaviorHash],
    layer: "behavior-hash",
    message: "Behavior hash evidence is present and not stale.",
    status: "passed",
  };
}

function buildParseCompletenessLayer(
  entry: GeneratedSupportProofCertificateInput,
): GeneratedSupportProofCertificateLayer {
  if (entry.parseStatus === "complete") {
    return {
      layer: "parse-completeness",
      message: "Certified parser reported a complete parse.",
      status: "passed",
    };
  }

  return {
    layer: "parse-completeness",
    message: `Certified parser reported ${entry.parseStatus}.`,
    status: "failed",
  };
}

function buildParserRuleCertificationLayer({
  componentEvidenceIds,
  entry,
  parserRuleIds,
  requiredRuntimeCapabilityIds,
}: {
  componentEvidenceIds: readonly string[];
  entry: GeneratedSupportProofCertificateInput;
  parserRuleIds: readonly string[];
  requiredRuntimeCapabilityIds: readonly string[];
}): GeneratedSupportProofCertificateLayer {
  if (parserRuleIds.length > 0) {
    return {
      evidenceIds: parserRuleIds,
      layer: "parser-rule-certification",
      message: "Parser-rule certification evidence is present.",
      status: "passed",
    };
  }

  if (
    entry.support?.status === "vanilla-confirmed" &&
    componentEvidenceIds.length === 0 &&
    requiredRuntimeCapabilityIds.length === 0
  ) {
    return {
      layer: "parser-rule-certification",
      message:
        "Parser-rule certification is not applicable to vanilla support.",
      status: "not-applicable",
    };
  }

  return {
    layer: "parser-rule-certification",
    message:
      "Parser-rule certification evidence is missing; scanner or component recognition is not support authority.",
    status: "missing",
  };
}

function buildGeneratedDslSchemaLayer(
  entry: GeneratedSupportProofCertificateInput,
): GeneratedSupportProofCertificateLayer {
  if (entry.blockers.some((blocker) => blocker.code === "invalid-dsl-schema")) {
    return {
      layer: "generated-dsl-schema",
      message: "Generated DSL schema validation failed.",
      status: "failed",
    };
  }

  if (entry.parseStatus !== "complete") {
    return {
      layer: "generated-dsl-schema",
      message:
        "Generated DSL schema validation is unavailable before complete parse.",
      status: "unavailable",
    };
  }

  if (
    entry.support?.status === "vanilla-confirmed" &&
    entry.effectDefinition === undefined
  ) {
    return {
      layer: "generated-dsl-schema",
      message: "Generated DSL schema is not applicable to vanilla support.",
      status: "not-applicable",
    };
  }

  return {
    layer: "generated-dsl-schema",
    message: "Generated DSL schema validation passed before capability gating.",
    status: "passed",
  };
}

function buildComponentEvidenceLayer({
  componentEvidenceIds,
  entry,
}: {
  componentEvidenceIds: readonly string[];
  entry: GeneratedSupportProofCertificateInput;
}): GeneratedSupportProofCertificateLayer {
  if (componentEvidenceIds.length > 0) {
    return {
      evidenceIds: componentEvidenceIds,
      layer: "component-evidence",
      message: "Generated-support component evidence IDs are present.",
      status: "passed",
    };
  }

  if (entry.support?.status === "vanilla-confirmed") {
    return {
      layer: "component-evidence",
      message: "Component evidence is not applicable to vanilla support.",
      status: "not-applicable",
    };
  }

  return {
    layer: "component-evidence",
    message:
      "Generated-support component evidence IDs are missing; scanner recognition is not component evidence.",
    status: "missing",
  };
}

function buildRequiredRuntimeCapabilitiesLayer({
  entry,
  requiredRuntimeCapabilityIds,
}: {
  entry: GeneratedSupportProofCertificateInput;
  requiredRuntimeCapabilityIds: readonly string[];
}): GeneratedSupportProofCertificateLayer {
  if (requiredRuntimeCapabilityIds.length > 0) {
    return {
      capabilityIds: requiredRuntimeCapabilityIds,
      layer: "required-runtime-capabilities",
      message: "Required runtime capability IDs are represented.",
      status: "passed",
    };
  }

  if (entry.support?.status === "vanilla-confirmed") {
    return {
      capabilityIds: [],
      layer: "required-runtime-capabilities",
      message: "Runtime capability IDs are not applicable to vanilla support.",
      status: "not-applicable",
    };
  }

  return {
    capabilityIds: [],
    layer: "required-runtime-capabilities",
    message: "Required runtime capability IDs are missing.",
    status: "missing",
  };
}

function buildMissingRuntimeCapabilitiesLayer(
  missingRuntimeCapabilityIds: readonly string[],
): GeneratedSupportProofCertificateLayer {
  if (missingRuntimeCapabilityIds.length > 0) {
    return {
      layer: "missing-runtime-capabilities",
      message: "One or more required runtime capabilities are missing.",
      missingCapabilityIds: missingRuntimeCapabilityIds,
      status: "failed",
    };
  }

  return {
    layer: "missing-runtime-capabilities",
    message: "No missing runtime capability IDs are reported.",
    missingCapabilityIds: [],
    status: "passed",
  };
}

function buildEngineProofTestEvidenceLayer({
  missingEngineProofRuntimeCapabilityIds,
  missingRuntimeCapabilityIds,
  requiredRuntimeCapabilityIds,
}: {
  missingEngineProofRuntimeCapabilityIds: readonly string[];
  missingRuntimeCapabilityIds: readonly string[];
  requiredRuntimeCapabilityIds: readonly string[];
}): GeneratedSupportProofCertificateLayer {
  if (requiredRuntimeCapabilityIds.length === 0) {
    return {
      layer: "engine-proof-test-evidence",
      message:
        "Engine proof/test evidence is not applicable without runtime capability requirements.",
      status: "not-applicable",
    };
  }

  if (missingRuntimeCapabilityIds.length > 0) {
    return {
      layer: "engine-proof-test-evidence",
      message:
        "Engine proof/test evidence is unavailable until required runtime capabilities are supported.",
      status: "unavailable",
    };
  }

  if (missingEngineProofRuntimeCapabilityIds.length > 0) {
    return {
      layer: "engine-proof-test-evidence",
      message:
        "Runtime capability IDs are present without represented engine proof/test evidence.",
      missingCapabilityIds: missingEngineProofRuntimeCapabilityIds,
      status: "missing",
    };
  }

  return {
    capabilityIds: requiredRuntimeCapabilityIds,
    layer: "engine-proof-test-evidence",
    message:
      "Engine proof/test evidence is represented by runtime capability evidence.",
    status: "passed",
  };
}

function buildSupportMetadataLayer(
  entry: GeneratedSupportProofCertificateInput,
): GeneratedSupportProofCertificateLayer {
  if (entry.support === undefined) {
    return {
      layer: "support-metadata",
      message: "Generated-support metadata is missing.",
      status: "missing",
    };
  }

  return {
    evidenceIds: [entry.support.status],
    layer: "support-metadata",
    message: "Generated-support metadata is present.",
    status: "passed",
  };
}

function buildReviewStateLayer(
  entry: GeneratedSupportProofCertificateInput,
): GeneratedSupportProofCertificateLayer {
  if (entry.support?.status === "vanilla-confirmed") {
    return {
      layer: "review-state",
      message:
        "Generated DSL review state is not applicable to vanilla support.",
      status: "not-applicable",
    };
  }

  const reviewer =
    entry.effectDefinition?.metadata.reviewedBy ??
    entry.effectDefinition?.metadata.reviewer;
  if (reviewer === undefined || reviewer.length === 0) {
    return {
      layer: "review-state",
      message: "Generated DSL review evidence is missing.",
      status: "missing",
    };
  }

  return {
    evidenceIds: [reviewer],
    layer: "review-state",
    message: "Generated DSL review evidence is present.",
    status: "passed",
  };
}

function buildTestedStateLayer(
  entry: GeneratedSupportProofCertificateInput,
): GeneratedSupportProofCertificateLayer {
  const supportTested = entry.support?.tested;
  const effectDefinitionTested = entry.effectDefinition?.metadata.tested;

  if (supportTested === false || effectDefinitionTested === false) {
    return {
      layer: "tested-state",
      message: "Generated-support tested-state evidence is explicitly false.",
      status: "failed",
    };
  }

  if (
    supportTested === true &&
    (entry.effectDefinition === undefined || effectDefinitionTested === true)
  ) {
    return {
      layer: "tested-state",
      message: "Generated-support tested-state evidence is present.",
      status: "passed",
    };
  }

  return {
    layer: "tested-state",
    message: "Generated-support tested-state evidence is missing.",
    status: "missing",
  };
}

function hasStaleSourceHashBlocker(
  blockers: readonly GeneratedSupportBlocker[],
): boolean {
  return blockers.some(
    (blocker) =>
      blocker.code === "stale-hash" &&
      !blocker.message.toLowerCase().includes("behavior"),
  );
}

function hasStaleBehaviorHashBlocker(
  blockers: readonly GeneratedSupportBlocker[],
): boolean {
  return blockers.some(
    (blocker) =>
      blocker.code === "stale-hash" &&
      blocker.message.toLowerCase().includes("behavior"),
  );
}

function isPassingProofLayerStatus(
  status: GeneratedSupportProofCertificateLayerStatus,
): boolean {
  return status === "passed" || status === "not-applicable";
}

function assertProofCertificateLayerOrder(
  chain: readonly GeneratedSupportProofCertificateLayer[],
): void {
  const actual = chain.map((layer) => layer.layer);
  const expected = [...generatedSupportProofCertificateLayers];
  if (
    actual.length !== expected.length ||
    actual.some((layer, index) => layer !== expected[index])
  ) {
    throw new Error("Generated-support proof certificate layer order drifted.");
  }
}

function compareBlockers(
  left: GeneratedSupportReportBlocker,
  right: GeneratedSupportReportBlocker,
): number {
  return (
    String(left.cardId).localeCompare(String(right.cardId)) ||
    left.code.localeCompare(right.code) ||
    compareOptional(left.component, right.component) ||
    compareOptional(left.capabilityId, right.capabilityId) ||
    compareOptional(left.parserRuleId, right.parserRuleId) ||
    left.message.localeCompare(right.message)
  );
}

function compareUnparsedSpans(
  left: GeneratedSupportReportUnparsedSpan,
  right: GeneratedSupportReportUnparsedSpan,
): number {
  return (
    String(left.cardId).localeCompare(String(right.cardId)) ||
    left.start - right.start ||
    left.end - right.end ||
    left.text.localeCompare(right.text)
  );
}

function compareOptional(
  left: string | undefined,
  right: string | undefined,
): number {
  return (left ?? "").localeCompare(right ?? "");
}

function sortedUnique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort();
}

function stripInternalBlockerFields(
  blocker: GeneratedSupportBlocker,
): Omit<GeneratedSupportBlocker, "schemaValidated"> {
  const publicBlocker = { ...blocker };
  delete publicBlocker.schemaValidated;
  return publicBlocker;
}

function isUnsupportedPrimitiveComponentLayer(
  layer: GeneratedSupportDiagnosticLayer,
): boolean {
  return (
    layer === "unsupported-primitive" ||
    layer === "unsupported-trigger" ||
    layer === "unsupported-cost" ||
    layer === "unsupported-optionality" ||
    layer === "unsupported-condition" ||
    layer === "unsupported-cardinality" ||
    layer === "unsupported-target" ||
    layer === "unsupported-destination" ||
    layer === "unsupported-duration" ||
    layer === "unsupported-modifier" ||
    layer === "unsupported-restriction" ||
    layer === "unsupported-saved-reference" ||
    layer === "unsupported-sequence-action-composition" ||
    layer === "unsupported-layer"
  );
}

export function classifyGeneratedSupportBlockerLayer(
  blocker: Pick<
    GeneratedSupportBlocker,
    "code" | "component" | "diagnosticLayer"
  >,
): GeneratedSupportDiagnosticLayer {
  if (blocker.diagnosticLayer !== undefined) {
    return blocker.diagnosticLayer;
  }

  switch (blocker.code) {
    case "unparsed-span":
    case "ambiguous-wording":
    case "custom-handler-required":
      return "parser";
    case "invalid-dsl-schema":
      return "schema";
    case "missing-runtime-capability":
      return "runtime-capability";
    case "stale-hash":
      return "stale-hash";
    case "unsupported-primitive":
      return classifyUnsupportedPrimitiveLayer(blocker.component);
    default:
      return "unsupported-layer";
  }
}

export function determineDeepestSuccessfulLayerForBlocker(
  blocker: Pick<
    GeneratedSupportBlocker,
    "code" | "component" | "diagnosticLayer" | "schemaValidated"
  >,
): GeneratedSupportDeepestSuccessfulLayer | undefined {
  const layer = classifyGeneratedSupportBlockerLayer(blocker);
  if (layer === "runtime-capability" && blocker.schemaValidated === true) {
    return "schema";
  }
  if (layer === "schema") {
    return "parser";
  }
  return undefined;
}

function classifyUnsupportedPrimitiveLayer(
  component: string | undefined,
): GeneratedSupportDiagnosticLayer {
  if (component === undefined) {
    return "unsupported-layer";
  }
  if (component.startsWith("source-integrity:")) {
    return "source-integrity";
  }
  if (component.startsWith("metadata:")) {
    return "metadata";
  }
  if (component.startsWith("review:")) {
    return "review";
  }
  if (component.startsWith("test-status:")) {
    return "test-status";
  }

  if (component.includes("saved")) {
    return "unsupported-saved-reference";
  }
  if (component.includes("cannotAttack") || component.includes("cannotBlock")) {
    return "unsupported-restriction";
  }
  if (component.includes("modifyPower")) {
    return "unsupported-modifier";
  }
  if (
    component.includes("duration") ||
    component.includes("untilStartOfNextTurn")
  ) {
    return "unsupported-duration";
  }
  if (component.includes("target") || component.includes("selectTargets")) {
    return "unsupported-target";
  }
  if (component.includes("destination")) {
    return "unsupported-destination";
  }
  if (component.includes("sequence:repeat") || component.includes("segment2")) {
    return "unsupported-cardinality";
  }
  if (component.includes("sequence-action-composition")) {
    return "unsupported-sequence-action-composition";
  }
  if (component.includes("condition")) {
    return "unsupported-condition";
  }
  if (component.includes("optional")) {
    return "unsupported-optionality";
  }
  if (
    component.includes("cost") ||
    component.includes("payCost") ||
    component.includes("returnDon")
  ) {
    return "unsupported-cost";
  }
  if (component.includes("trigger")) {
    return "unsupported-trigger";
  }
  if (component.includes("effect")) {
    return "unsupported-primitive";
  }

  return "unsupported-layer";
}
