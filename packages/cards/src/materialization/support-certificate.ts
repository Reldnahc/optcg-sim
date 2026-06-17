import type {
  EffectTextSpanId,
  MissingSupportEvidence,
  ParserSupportCertificate,
  SupportEvidenceFamily,
  SupportEvidenceRecord,
} from "@optcg/types";

import type { ParsedRuntimeEffectLine, PrimitiveEvidence } from "../types.js";

const parserAuthority = "parser" as const;

const directFamilyPrefixes: ReadonlySet<SupportEvidenceFamily> = new Set([
  "wrapper",
  "marker",
  "sourcePresence",
  "activation",
  "trigger",
  "entrySupport",
  "cost",
  "condition",
  "target",
  "targetConstraint",
  "filter",
  "cardinality",
  "zone",
  "visibility",
  "destination",
  "player",
  "chooser",
  "duration",
  "usageLimit",
  "modifier",
  "replacement",
  "reference",
  "composition",
  "connector",
  "expression",
  "keyword",
  "remaining",
  "order",
  "position",
  "deckRestriction",
  "state",
  "sourceCategory",
  "instructionSupport",
]);

const evidenceFamily = (evidence: PrimitiveEvidence): SupportEvidenceFamily => {
  const prefix = evidence.split(":")[0] ?? "unknown";
  if (prefix === "entry") return "entryPoint";
  if (prefix === "instruction") return "body";
  if (prefix === "reveal") return "visibility";
  if (prefix === "look") return "zone";
  if (prefix === "count") return "quantity";
  if (
    prefix === "value" ||
    prefix === "valueSource" ||
    prefix === "valueOffset" ||
    prefix === "valueTransform"
  ) {
    return "value";
  }
  return directFamilyPrefixes.has(prefix as SupportEvidenceFamily)
    ? (prefix as SupportEvidenceFamily)
    : "unknown";
};

const evidenceId = (evidence: PrimitiveEvidence): string => {
  const separatorIndex = evidence.indexOf(":");
  return separatorIndex < 0 ? evidence : evidence.slice(separatorIndex + 1);
};

const spanIdsForEvidence = (
  line: ParsedRuntimeEffectLine,
  evidence: PrimitiveEvidence,
): readonly EffectTextSpanId[] | undefined => {
  const spanIds =
    line.sourceMap?.spans
      .filter((span) => span.primitiveEvidence?.includes(evidence) === true)
      .map((span) => span.id) ?? [];
  return spanIds.length === 0 ? undefined : spanIds;
};

export const createParserSupportCertificate = (
  lines: readonly ParsedRuntimeEffectLine[],
): ParserSupportCertificate => {
  const recordsByKey = new Map<string, SupportEvidenceRecord>();
  const missing: MissingSupportEvidence[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    if (line.evidence.length === 0) {
      missing.push({
        authority: parserAuthority,
        family: "unknown",
        id: "primitiveEvidence",
        reason: "runtime effect line has no primitive parser evidence",
        effectPath: [String(lineIndex)],
      });
      continue;
    }

    for (const evidence of line.evidence) {
      const family = evidenceFamily(evidence);
      const id = evidenceId(evidence);
      const sourceSpanIds = spanIdsForEvidence(line, evidence);
      const key = `${family}:${id}`;
      const existing = recordsByKey.get(key);
      const mergedSpanIds = new Set<EffectTextSpanId>([
        ...(existing?.sourceSpanIds ?? []),
        ...(sourceSpanIds ?? []),
      ]);

      recordsByKey.set(key, {
        authority: parserAuthority,
        family,
        id,
        ...(mergedSpanIds.size === 0
          ? {}
          : { sourceSpanIds: [...mergedSpanIds] }),
      });
    }
  }

  return {
    complete: missing.length === 0,
    records: [...recordsByKey.values()],
    missing,
  };
};
