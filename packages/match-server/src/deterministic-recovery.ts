import {
  applyDeterministicEntry,
  checkpointResolverFromList,
} from "@optcg/engine-core";

import type { LocalDevMatch } from "./local-match.js";
import type { LocalRollbackState } from "./local-rollback.js";
import type {
  MatchPersistenceSnapshot,
  StoredDeterministicSessionRecord,
} from "./session-types.js";
import { replayLegacyRecoveryRecords } from "./deterministic-entry-legacy.js";

const withoutPendingRequest = (
  rollback: LocalRollbackState,
): LocalRollbackState => {
  const next: LocalRollbackState = { ...rollback };
  delete next.pendingRequest;
  return next;
};

const applyDeterministicRecoveryEntry = (
  match: LocalDevMatch,
  record: StoredDeterministicSessionRecord,
  checkpointResolver: ReturnType<typeof checkpointResolverFromList>,
): string | undefined => {
  const entry = record.deterministicEntry;
  let nextRollback = match.rollback;
  if (entry.kind === "system") {
    const operation = entry.operation;
    if (operation.type === "requestRollbackConsent") {
      nextRollback = {
        ...match.rollback,
        pendingRequest: {
          rollbackPointId: operation.rollbackPointId,
          requestedBy: operation.playerId,
          approvingPlayerId: operation.approvingPlayerId,
        },
      };
    }
    if (operation.type === "cancelRollbackConsent") {
      nextRollback = withoutPendingRequest(match.rollback);
    }
    if (operation.type === "restoreRollbackPoint") {
      const checkpoint = checkpointResolver(operation.rollbackPointId);
      if (checkpoint === undefined) {
        return `rollback checkpoint ${operation.rollbackPointId} missing`;
      }
      const rollback = withoutPendingRequest(match.rollback);
      nextRollback = {
        ...rollback,
        points: match.rollback.points.filter(
          (point) => point.stateSeq <= checkpoint.stateSeq,
        ),
        checkpoints: match.rollback.checkpoints,
      };
    }
  }

  const result = applyDeterministicEntry(
    match.state,
    entry,
    checkpointResolver,
  );
  if (result.status === "failed") {
    return result.reason;
  }
  match.state = result.state;
  match.rollback = nextRollback;
  return undefined;
};

export const replayDeterministicRecoveryEntries = (
  match: LocalDevMatch,
  snapshot: MatchPersistenceSnapshot,
): string | undefined => {
  const records = snapshot.deterministicEntriesSinceSnapshot;
  if (snapshot.deterministicLogVersion === "deterministic-entry-v1") {
    if (records === undefined) {
      return "deterministic recovery tail entries missing";
    }
    if (records.length === 0) {
      return undefined;
    }
  } else {
    if (records !== undefined && records.length > 0) {
      return "deterministic recovery entries missing deterministic log version";
    }
    if (snapshot.actions.length > 0 || snapshot.decisions.length > 0) {
      return replayLegacyRecoveryRecords(match, snapshot);
    }
    return undefined;
  }

  const checkpoints = [
    ...(snapshot.deterministicCheckpoints?.map((record) => record.checkpoint) ??
      []),
    ...(snapshot.recoveryContext?.rollback.checkpoints ?? []),
  ];
  const checkpointResolver = checkpointResolverFromList(checkpoints);
  for (const record of records) {
    const error = applyDeterministicRecoveryEntry(
      match,
      record,
      checkpointResolver,
    );
    if (error !== undefined) {
      return `deterministic replay failed at entry ${String(
        record.deterministicEntry.entrySeq,
      )}: ${error}`;
    }
  }
  return undefined;
};
