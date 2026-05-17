import type { CardId } from "@optcg/types";

import type { GeneratedSupportIndex } from "./generated-support-index.js";
import type {
  GeneratedSupportBlockerCode,
  GeneratedSupportDiagnosticLayer,
  GeneratedSupportParserResultStatus,
  GeneratedSupportBlocker,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";

export interface GeneratedSupportReport {
  blockerCount: number;
  blockers: readonly GeneratedSupportReportBlocker[];
  missingRuntimeCapabilityIds: readonly string[];
  parserRuleIdsUsed: readonly string[];
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
  layer: GeneratedSupportDiagnosticLayer;
  message: string;
  capabilityId?: string;
  component?: string;
  expectedHash?: string;
  parserRuleId?: string;
  receivedHash?: string;
  span?: GeneratedSupportUnparsedSpan;
}

export interface GeneratedSupportReportCardStatus {
  blockerCodes: readonly GeneratedSupportBlockerCode[];
  missingCapabilityIds: readonly string[];
  parseStatus: GeneratedSupportParserResultStatus;
  parserRuleIds: readonly string[];
  status: "supported" | "unsupported";
}

export interface GeneratedSupportReportUnparsedSpan extends GeneratedSupportUnparsedSpan {
  cardId: CardId;
}

export function buildGeneratedSupportReport(
  index: GeneratedSupportIndex,
): GeneratedSupportReport {
  const entries = [...index.entries].sort((left, right) =>
    String(left.cardId).localeCompare(String(right.cardId)),
  );
  const blockers = entries
    .flatMap((entry) =>
      entry.blockers.map(
        (blocker): GeneratedSupportReportBlocker => ({
          ...blocker,
          cardId: entry.cardId,
          layer: classifyGeneratedSupportBlockerLayer(blocker),
        }),
      ),
    )
    .sort(compareBlockers);

  return {
    blockerCount: blockers.length,
    blockers,
    missingRuntimeCapabilityIds: sortedUnique(
      entries.flatMap((entry) => entry.missingCapabilityIds),
    ),
    parserRuleIdsUsed: sortedUnique(
      entries.flatMap((entry) => entry.parserRuleIds),
    ),
    statusByCardId: Object.fromEntries(
      entries.map((entry) => [
        entry.cardId,
        {
          blockerCodes: sortedUnique(
            entry.blockers.map((blocker) => blocker.code),
          ),
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
    layer === "unsupported-duration" ||
    layer === "unsupported-modifier" ||
    layer === "unsupported-restriction" ||
    layer === "unsupported-saved-reference" ||
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
  if (component.includes("sequence:repeat") || component.includes("segment2")) {
    return "unsupported-cardinality";
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
