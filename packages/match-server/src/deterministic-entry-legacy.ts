import { createMatchSessionRuntime } from "./match-session.js";
import type { LocalDevMatch } from "./local-match.js";
import type {
  MatchPersistenceSnapshot,
  StoredSessionRecord,
} from "./session-types.js";

const sortedRecoveryRecords = (
  snapshot: MatchPersistenceSnapshot,
): StoredSessionRecord[] =>
  [...snapshot.actions, ...snapshot.decisions].sort((left, right) => {
    const stateDelta = left.result.stateSeq - right.result.stateSeq;
    if (stateDelta !== 0) {
      return stateDelta;
    }
    const recordedAtDelta =
      Date.parse(left.recordedAt) - Date.parse(right.recordedAt);
    if (recordedAtDelta !== 0) {
      return recordedAtDelta;
    }
    return left.envelope.clientActionId.localeCompare(
      right.envelope.clientActionId,
    );
  });

export const replayLegacyRecoveryRecords = (
  match: LocalDevMatch,
  snapshot: MatchPersistenceSnapshot,
): string | undefined => {
  const runtime = createMatchSessionRuntime({
    local: match,
    includeActionSnapshots: false,
  });
  for (const record of sortedRecoveryRecords(snapshot)) {
    const result = runtime.applyEnvelope(record.envelope);
    if (!result.accepted) {
      return `replay rejected ${record.envelope.clientActionId}: ${result.errors.join(
        "; ",
      )}`;
    }
    if (
      result.stateSeq !== record.result.stateSeq ||
      result.actionSeq !== record.result.actionSeq
    ) {
      return `replay diverged at ${record.envelope.clientActionId}`;
    }
  }
  return undefined;
};
