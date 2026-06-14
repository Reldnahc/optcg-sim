import type {
  MissingSupportEvidence,
  ParserSupportCertificate,
  RuntimeSupportReport,
  SupportEvidenceRecord,
} from "@optcg/types";

export interface PrimitiveSupportSectionInput {
  readonly parserCertificate: ParserSupportCertificate;
  readonly runtimeReports: readonly RuntimeSupportReport[];
}

export const formatPrimitiveSupportSections = ({
  parserCertificate,
  runtimeReports,
}: PrimitiveSupportSectionInput): readonly string[] => {
  const runtimeSupported =
    runtimeReports.length > 0 &&
    runtimeReports.every((report) => report.supported);
  const runtimeRecords = runtimeReports.flatMap((report) => report.records);
  const runtimeMissing = runtimeReports.flatMap((report) => report.missing);

  return [
    `Primitive parser: ${parserCertificate.complete ? "passed" : "failed"}`,
    `Primitive runtime: ${runtimeSupported ? "passed" : "failed"}`,
    ...(parserCertificate.records.length === 0
      ? []
      : [
          "Parser certificate records:",
          ...parserCertificate.records.map(formatSupportEvidenceRecord),
        ]),
    ...(runtimeRecords.length === 0
      ? []
      : [
          "Runtime support records:",
          ...runtimeRecords.map(formatSupportEvidenceRecord),
        ]),
    ...(parserCertificate.missing.length === 0
      ? []
      : [
          "Missing parser evidence:",
          ...parserCertificate.missing.map(formatMissingSupportEvidence),
        ]),
    ...(runtimeMissing.length === 0
      ? []
      : [
          "Missing runtime capability evidence:",
          ...runtimeMissing.map(formatMissingSupportEvidence),
        ]),
  ];
};

export const prefixPrimitiveSupportLines = (
  prefix: string,
  lines: readonly string[],
): readonly string[] =>
  lines.map((line) => `${prefix}${lowercaseSectionLead(line)}`);

const lowercaseSectionLead = (line: string): string =>
  line.length === 0
    ? line
    : `${line.charAt(0).toLocaleLowerCase("en-US")}${line.slice(1)}`;

const formatSupportEvidenceRecord = (record: SupportEvidenceRecord): string => {
  const status =
    record.supported === undefined
      ? ""
      : record.supported
        ? " passed"
        : " failed";
  const spans =
    record.sourceSpanIds === undefined || record.sourceSpanIds.length === 0
      ? ""
      : ` spans ${record.sourceSpanIds.join(", ")}`;
  return `- ${record.authority} ${record.family}:${record.id}${status}${spans}`;
};

const formatMissingSupportEvidence = (
  missing: MissingSupportEvidence,
): string =>
  `- ${missing.authority} ${missing.family}:${missing.id} missing ${missing.reason}`;
