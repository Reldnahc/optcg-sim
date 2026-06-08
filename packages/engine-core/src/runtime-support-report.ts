import type {
  MissingSupportEvidence,
  RuntimeSupportReport,
  SupportEvidenceFamily,
  SupportEvidenceRecord,
} from "@optcg/types";

interface RuntimeSupportRecordInput {
  readonly family: SupportEvidenceFamily;
  readonly id: string;
  readonly supported: boolean;
  readonly reason?: string;
  readonly effectPath?: readonly string[];
}

export const runtimeSupportRecord = ({
  family,
  id,
  supported,
  reason,
  effectPath,
}: RuntimeSupportRecordInput): SupportEvidenceRecord => ({
  authority: "runtime",
  family,
  id,
  supported,
  ...(reason === undefined ? {} : { reason }),
  ...(effectPath === undefined ? {} : { effectPath }),
});

export const createRuntimeSupportReport = (
  records: readonly SupportEvidenceRecord[],
): RuntimeSupportReport => {
  const missing = missingRuntimeEvidence(records);
  const reason = missing[0]?.reason;

  return {
    supported: missing.length === 0,
    ...(reason === undefined ? {} : { reason }),
    records,
    missing,
  };
};

const missingRuntimeEvidence = (
  records: readonly SupportEvidenceRecord[],
): readonly MissingSupportEvidence[] =>
  records.flatMap((record) => {
    if (record.supported !== false) {
      return [];
    }
    return [
      {
        authority: "runtime",
        family: record.family,
        id: record.id,
        reason: record.reason ?? "unsupported runtime evidence",
        ...(record.effectPath === undefined
          ? {}
          : { effectPath: record.effectPath }),
      },
    ];
  });
