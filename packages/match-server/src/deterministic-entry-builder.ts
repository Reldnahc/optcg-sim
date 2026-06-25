import type { DeterministicMatchEntry, StateSeq } from "@optcg/types";

import type { LocalDeterministicOperation } from "./local-match.js";
import type {
  ClientActionEnvelope,
  SessionActionResult,
  StoredDeterministicSessionRecord,
  StoredSessionAuditRecord,
} from "./session-types.js";

export interface BuildStoredDeterministicSessionRecordInput {
  readonly matchId: DeterministicMatchEntry["matchId"];
  readonly entrySeq: number;
  readonly envelope: ClientActionEnvelope;
  readonly result: SessionActionResult;
  readonly replayDisplayFrame?: StoredDeterministicSessionRecord["replayDisplayFrame"];
  readonly deterministicOperation: LocalDeterministicOperation;
  readonly stateSeqBefore: StateSeq;
  readonly actionSeqBefore: number;
  readonly stateHashBefore: string;
  readonly stateSeqAfter: StateSeq;
  readonly actionSeqAfter: number;
  readonly stateHashAfter: string;
  readonly recordedAt: string;
}

const verification = ({
  actionSeqAfter,
  actionSeqBefore,
  stateHashAfter,
  stateHashBefore,
  stateSeqAfter,
  stateSeqBefore,
}: Pick<
  BuildStoredDeterministicSessionRecordInput,
  | "actionSeqAfter"
  | "actionSeqBefore"
  | "stateHashAfter"
  | "stateHashBefore"
  | "stateSeqAfter"
  | "stateSeqBefore"
>): DeterministicMatchEntry["verification"] => ({
  stateSeqBefore,
  actionSeqBefore,
  stateHashBefore,
  stateSeqAfter,
  actionSeqAfter,
  stateHashAfter,
  hashScope: "gameplay-v1",
});

const deterministicEntry = (
  input: BuildStoredDeterministicSessionRecordInput,
): DeterministicMatchEntry => {
  const base = {
    formatVersion: "deterministic-entry-v1" as const,
    matchId: input.matchId,
    entrySeq: input.entrySeq,
    verification: verification(input),
  };
  switch (input.deterministicOperation.kind) {
    case "action":
      return {
        ...base,
        kind: "action",
        playerId: input.envelope.playerId,
        action: input.deterministicOperation.action,
      };
    case "decision":
      return {
        ...base,
        kind: "decision",
        playerId: input.envelope.playerId,
        decisionId: input.deterministicOperation.decisionId,
        response: input.deterministicOperation.response,
      };
    case "system":
      return {
        ...base,
        kind: "system",
        operation: input.deterministicOperation.operation,
      };
  }
};

const auditRecord = ({
  envelope,
  recordedAt,
  result,
}: Pick<
  BuildStoredDeterministicSessionRecordInput,
  "envelope" | "recordedAt" | "result"
>): StoredSessionAuditRecord => ({
  type: "clientEnvelope",
  envelope,
  result,
  recordedAt,
});

export const buildStoredDeterministicSessionRecord = (
  input: BuildStoredDeterministicSessionRecordInput,
): StoredDeterministicSessionRecord => ({
  deterministicEntry: deterministicEntry(input),
  audit: auditRecord(input),
  ...(input.replayDisplayFrame === undefined
    ? {}
    : { replayDisplayFrame: input.replayDisplayFrame }),
});
