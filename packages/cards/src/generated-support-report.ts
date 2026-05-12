import type { CardId } from "@optcg/types";

import type { GeneratedSupportIndex } from "./generated-support-index.js";
import type {
  GeneratedSupportBlockerCode,
  GeneratedSupportParserResultStatus,
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
