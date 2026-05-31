import type { MatchId } from "@optcg/types";

import type {
  MatchPersistence,
  MatchPersistenceSnapshot,
  RecoveryLock,
  StoredSessionRecord,
} from "./session-types.js";

export interface FreezeRecord {
  readonly matchId: MatchId;
  readonly reason: string;
  readonly frozenAt: string;
}

export interface InMemoryMatchPersistence extends MatchPersistence {
  freezeRecords(): readonly FreezeRecord[];
}

interface StoredSnapshot extends MatchPersistenceSnapshot {
  actions: StoredSessionRecord[];
  decisions: StoredSessionRecord[];
}

const clone = <T>(value: T): T => structuredClone(value);

const lockExpired = (lock: RecoveryLock, now: string): boolean =>
  Date.parse(lock.expiresAt) <= Date.parse(now);

export const createInMemoryMatchPersistence = (): InMemoryMatchPersistence => {
  const snapshots = new Map<MatchId, StoredSnapshot>();
  const locks = new Map<MatchId, RecoveryLock>();
  const freezes: FreezeRecord[] = [];

  const snapshotForAppend = (matchId: MatchId): StoredSnapshot => {
    const existing = snapshots.get(matchId);
    if (existing !== undefined) {
      return existing;
    }
    throw new Error(
      `Cannot append record for missing match ${String(matchId)}.`,
    );
  };

  return {
    saveSnapshot(input) {
      snapshots.set(input.metadata.matchId, {
        metadata: clone(input.metadata),
        state: clone(input.state),
        manifest: clone(input.manifest),
        actions: clone([...input.actions]),
        decisions: clone([...input.decisions]),
      });
      return Promise.resolve();
    },
    appendAction({ matchId, record }) {
      snapshotForAppend(matchId).actions.push(clone(record));
      return Promise.resolve();
    },
    appendDecision({ matchId, record }) {
      snapshotForAppend(matchId).decisions.push(clone(record));
      return Promise.resolve();
    },
    loadSnapshot(matchId) {
      const snapshot = snapshots.get(matchId);
      return Promise.resolve(
        snapshot === undefined ? undefined : clone(snapshot),
      );
    },
    listActiveMatchIds() {
      return Promise.resolve([...snapshots.keys()]);
    },
    tryAcquireRecoveryLock({ matchId, ownerInstanceId, now, ttlMs }) {
      const existing = locks.get(matchId);
      if (
        existing !== undefined &&
        existing.ownerInstanceId !== ownerInstanceId &&
        !lockExpired(existing, now)
      ) {
        return Promise.resolve(undefined);
      }
      const acquiredAtMs = Date.parse(now);
      const lock: RecoveryLock = {
        matchId,
        ownerInstanceId,
        acquiredAt: new Date(acquiredAtMs).toISOString(),
        expiresAt: new Date(acquiredAtMs + ttlMs).toISOString(),
      };
      locks.set(matchId, lock);
      return Promise.resolve(clone(lock));
    },
    releaseRecoveryLock({ matchId, ownerInstanceId }) {
      const existing = locks.get(matchId);
      if (existing?.ownerInstanceId === ownerInstanceId) {
        locks.delete(matchId);
      }
      return Promise.resolve();
    },
    freezeMatch(input) {
      freezes.push(clone(input));
      return Promise.resolve();
    },
    freezeRecords() {
      return clone(freezes);
    },
  };
};
