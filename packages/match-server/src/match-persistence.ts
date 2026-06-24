import type { MatchId } from "@optcg/types";

import type {
  MatchPersistence,
  MatchPersistenceSnapshot,
  RecoveryLock,
  StoredDeterministicCheckpointRecord,
  StoredDeterministicSessionRecord,
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
  actions: readonly StoredSessionRecord[];
  decisions: readonly StoredSessionRecord[];
  deterministicEntriesSinceSnapshot?: readonly StoredDeterministicSessionRecord[];
}

const clone = <T>(value: T): T => structuredClone(value);

const lockExpired = (lock: RecoveryLock, now: string): boolean =>
  Date.parse(lock.expiresAt) <= Date.parse(now);

export const createInMemoryMatchPersistence = (): InMemoryMatchPersistence => {
  const snapshots = new Map<MatchId, StoredSnapshot>();
  const actions = new Map<MatchId, StoredSessionRecord[]>();
  const decisions = new Map<MatchId, StoredSessionRecord[]>();
  const deterministicEntries = new Map<
    MatchId,
    StoredDeterministicSessionRecord[]
  >();
  const deterministicCheckpoints = new Map<
    MatchId,
    StoredDeterministicCheckpointRecord[]
  >();
  const locks = new Map<MatchId, RecoveryLock>();
  const freezes: FreezeRecord[] = [];

  const recordsForAppend = (
    store: Map<MatchId, StoredSessionRecord[]>,
    matchId: MatchId,
  ): StoredSessionRecord[] => {
    const existing = store.get(matchId);
    if (existing !== undefined) {
      return existing;
    }
    const created: StoredSessionRecord[] = [];
    store.set(matchId, created);
    return created;
  };

  return {
    saveSnapshot(input) {
      snapshots.set(input.metadata.matchId, {
        metadata: clone(input.metadata),
        state: clone(input.state),
        manifest: clone(input.manifest),
        ...(input.recoveryContext === undefined
          ? {}
          : { recoveryContext: clone(input.recoveryContext) }),
        ...(input.deterministicLogVersion === undefined
          ? {}
          : { deterministicLogVersion: input.deterministicLogVersion }),
        ...(input.deterministicCheckpoints === undefined
          ? {}
          : { deterministicCheckpoints: clone(input.deterministicCheckpoints) }),
        actions: [],
        decisions: [],
      });
      actions.set(input.metadata.matchId, clone([...input.actions]));
      decisions.set(input.metadata.matchId, clone([...input.decisions]));
      deterministicEntries.set(
        input.metadata.matchId,
        clone([...(input.deterministicEntriesSinceSnapshot ?? [])]),
      );
      deterministicCheckpoints.set(
        input.metadata.matchId,
        clone([...(input.deterministicCheckpoints ?? [])]),
      );
      return Promise.resolve();
    },
    appendDeterministicEntry({ matchId, record }) {
      const existing = deterministicEntries.get(matchId) ?? [];
      existing.push(clone(record));
      deterministicEntries.set(matchId, existing);
      return Promise.resolve();
    },
    appendDeterministicCheckpoint({ matchId, record }) {
      const existing = deterministicCheckpoints.get(matchId) ?? [];
      existing.push(clone(record));
      deterministicCheckpoints.set(matchId, existing);
      return Promise.resolve();
    },
    appendAction({ matchId, record }) {
      recordsForAppend(actions, matchId).push(clone(record));
      return Promise.resolve();
    },
    appendDecision({ matchId, record }) {
      recordsForAppend(decisions, matchId).push(clone(record));
      return Promise.resolve();
    },
    loadSnapshot(matchId) {
      const snapshot = snapshots.get(matchId);
      if (snapshot === undefined) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(
        clone({
          ...snapshot,
          actions: actions.get(matchId) ?? [],
          decisions: decisions.get(matchId) ?? [],
          deterministicEntriesSinceSnapshot:
            deterministicEntries.get(matchId) ?? [],
          deterministicCheckpoints: deterministicCheckpoints.get(matchId) ?? [],
        }),
      );
    },
    listActiveMatchIds() {
      return Promise.resolve([
        ...new Set([
          ...snapshots.keys(),
          ...actions.keys(),
          ...decisions.keys(),
        ]),
      ]);
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
    releaseRecoveryLock({ lock }) {
      const existing = locks.get(lock.matchId);
      if (
        existing?.ownerInstanceId === lock.ownerInstanceId &&
        existing.acquiredAt === lock.acquiredAt &&
        existing.expiresAt === lock.expiresAt
      ) {
        locks.delete(lock.matchId);
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
