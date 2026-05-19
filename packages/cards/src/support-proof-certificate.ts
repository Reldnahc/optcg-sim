import type { CardImplementationRecord } from "@optcg/types";

import type {
  GeneratedSupportIndexEntry,
  RuntimeCapabilityEvidence,
} from "./generated-support-index.js";
import type {
  GeneratedSupportBlocker,
  GeneratedSupportParserResultStatus,
} from "./generated-support-types.js";
import { listRequiredRuntimeCapabilityIdsForComponentEvidenceId } from "./generated-support-types.js";

export type GeneratedSupportHashStatus =
  | "current"
  | "not-represented"
  | "stale";

export type GeneratedSupportProofStepName =
  | "source/behavior hash status"
  | "parse completeness"
  | "generated DSL schema validation"
  | "component evidence IDs"
  | "required runtime capability IDs"
  | "missing runtime capability IDs"
  | "engine-proof/test-evidence status"
  | "final playable decision";

export interface GeneratedSupportProofCertificate {
  playable: boolean;
  supportChain: readonly GeneratedSupportProofCertificateStep[];
}

export interface GeneratedSupportProofCertificateStep {
  name: GeneratedSupportProofStepName;
  order: number;
  status: string;
  ids?: readonly string[];
  missingIds?: readonly string[];
}

export function buildProofCertificateForIndexEntry(
  entry: GeneratedSupportIndexEntry,
): GeneratedSupportProofCertificate {
  return buildGeneratedSupportProofCertificate({
    behaviorHashStatus: "not-represented",
    blockers: entry.blockers,
    capabilityEvidence: entry.capabilityEvidence,
    componentEvidenceIds: entry.componentEvidenceIds,
    missingCapabilityIds: entry.missingCapabilityIds,
    parseStatus: entry.parseStatus,
    playable: entry.status === "supported",
    sourceHashStatus: hasStaleHashBlocker(entry.blockers) ? "stale" : "current",
    support: entry.support,
  });
}

export function buildGeneratedSupportProofCertificate(input: {
  behaviorHashStatus: GeneratedSupportHashStatus;
  blockers: readonly GeneratedSupportBlocker[];
  capabilityEvidence: readonly RuntimeCapabilityEvidence[];
  componentEvidenceIds: readonly string[];
  missingCapabilityIds: readonly string[];
  parseStatus: GeneratedSupportParserResultStatus;
  playable: boolean;
  sourceHashStatus: GeneratedSupportHashStatus;
  support?: CardImplementationRecord | undefined;
}): GeneratedSupportProofCertificate {
  const requiredRuntimeCapabilityIds = sortedUnique([
    ...input.componentEvidenceIds.flatMap((componentEvidenceId) =>
      listRequiredRuntimeCapabilityIdsForComponentEvidenceId(
        componentEvidenceId,
      ),
    ),
    ...input.capabilityEvidence.map((evidence) => evidence.capabilityId),
    ...input.missingCapabilityIds,
  ]);
  const schemaValidationStatus = toSchemaValidationStatus({
    blockers: input.blockers,
    parseStatus: input.parseStatus,
  });
  const engineProofStatus = toEngineProofStatus({
    missingCapabilityIds: input.missingCapabilityIds,
    parseStatus: input.parseStatus,
    schemaValidationStatus,
    support: input.support,
  });

  return {
    playable: input.playable,
    supportChain: [
      {
        name: "source/behavior hash status",
        order: 1,
        status: `source=${input.sourceHashStatus}; behavior=${input.behaviorHashStatus}`,
      },
      {
        name: "parse completeness",
        order: 2,
        status: input.parseStatus,
      },
      {
        name: "generated DSL schema validation",
        order: 3,
        status: schemaValidationStatus,
      },
      toIdsStep({
        ids: sortedUnique(input.componentEvidenceIds),
        name: "component evidence IDs",
        order: 4,
      }),
      toIdsStep({
        ids: requiredRuntimeCapabilityIds,
        name: "required runtime capability IDs",
        order: 5,
      }),
      toMissingIdsStep(sortedUnique(input.missingCapabilityIds)),
      {
        name: "engine-proof/test-evidence status",
        order: 7,
        status: engineProofStatus,
      },
      {
        name: "final playable decision",
        order: 8,
        status: input.playable ? "yes" : "no",
      },
    ],
  };
}

export function formatGeneratedSupportProofCertificate(
  certificate: GeneratedSupportProofCertificate,
): string {
  return [
    "Generated support proof/certificate:",
    ...certificate.supportChain.map(formatProofStep),
  ].join("\n");
}

function formatProofStep(step: GeneratedSupportProofCertificateStep): string {
  if (step.ids !== undefined) {
    return `  ${String(step.order)}. ${step.name}: ${formatIds(step.ids)}`;
  }
  if (step.missingIds !== undefined) {
    return `  ${String(step.order)}. ${step.name}: ${formatIds(
      step.missingIds,
    )}`;
  }
  return `  ${String(step.order)}. ${step.name}: ${step.status}`;
}

function toIdsStep({
  ids,
  name,
  order,
}: {
  ids: readonly string[];
  name: GeneratedSupportProofStepName;
  order: number;
}): GeneratedSupportProofCertificateStep {
  if (ids.length === 0) {
    return {
      name,
      order,
      status: "none",
    };
  }

  return {
    ids,
    name,
    order,
    status: "present",
  };
}

function toMissingIdsStep(
  missingIds: readonly string[],
): GeneratedSupportProofCertificateStep {
  if (missingIds.length === 0) {
    return {
      name: "missing runtime capability IDs",
      order: 6,
      status: "none",
    };
  }

  return {
    missingIds,
    name: "missing runtime capability IDs",
    order: 6,
    status: "missing",
  };
}

function toSchemaValidationStatus({
  blockers,
  parseStatus,
}: {
  blockers: readonly GeneratedSupportBlocker[];
  parseStatus: GeneratedSupportParserResultStatus;
}): "fail" | "not-run" | "pass" {
  if (blockers.some((blocker) => blocker.code === "invalid-dsl-schema")) {
    return "fail";
  }
  if (parseStatus === "complete") {
    return "pass";
  }
  return "not-run";
}

function toEngineProofStatus({
  missingCapabilityIds,
  parseStatus,
  schemaValidationStatus,
  support,
}: {
  missingCapabilityIds: readonly string[];
  parseStatus: GeneratedSupportParserResultStatus;
  schemaValidationStatus: "fail" | "not-run" | "pass";
  support?: CardImplementationRecord | undefined;
}): "missing" | "not-represented" | "present" {
  if (support?.tested === true) {
    return "present";
  }
  if (
    parseStatus === "complete" &&
    schemaValidationStatus === "pass" &&
    missingCapabilityIds.length > 0
  ) {
    return "missing";
  }
  return "not-represented";
}

function hasStaleHashBlocker(
  blockers: readonly GeneratedSupportBlocker[],
): boolean {
  return blockers.some((blocker) => blocker.code === "stale-hash");
}

function formatIds(ids: readonly string[]): string {
  return ids.length === 0 ? "none" : ids.join(", ");
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
