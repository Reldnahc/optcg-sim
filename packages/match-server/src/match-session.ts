import {
  hashReplayStateForScope,
} from "@optcg/engine-core";
import {
  applyLocalDevAction,
  applyLocalDevDecision,
  cancelLocalDevRollback,
  getLocalDevSnapshot,
  requestLocalDevRollback,
  type LocalDevMatch,
} from "./local-match.js";
import { idempotencyKey, requestHash } from "./action-envelope.js";
import { buildStoredDeterministicSessionRecord } from "./deterministic-entry-builder.js";
import type {
  ActionRejectionReason,
  ClientActionEnvelope,
  MatchPersistence,
  MatchRecoveryContext,
  MatchSessionMetadata,
  SessionActionResult,
  SessionActionRequest,
  StoredDeterministicCheckpointRecord,
  StoredDeterministicSessionRecord,
  StoredSessionRecord,
} from "./session-types.js";

export interface MatchSessionRuntime {
  applyEnvelope: (envelope: ClientActionEnvelope) => SessionActionResult;
  flushPersistence: () => Promise<void>;
  saveSnapshot: () => Promise<void>;
  records: () => readonly StoredSessionRecord[];
  deterministicRecords: () => readonly StoredDeterministicSessionRecord[];
  deterministicCheckpoints: () => readonly StoredDeterministicCheckpointRecord[];
}

export interface CreateMatchSessionRuntimeOptions {
  readonly local: LocalDevMatch;
  readonly metadata?: MatchSessionMetadata;
  readonly persistence?: MatchPersistence;
  readonly initialRecords?: {
    readonly actions?: readonly StoredSessionRecord[];
    readonly decisions?: readonly StoredSessionRecord[];
  };
  readonly recoveryContext?: () => MatchRecoveryContext | undefined;
  readonly includeActionSnapshots?: boolean;
  readonly now?: () => string;
}

const resultFromLocal = (
  envelope: ClientActionEnvelope,
  applied: ReturnType<typeof applyLocalDevAction>,
): SessionActionResult => ({
  type: "actionResult",
  matchId: envelope.matchId,
  clientActionId: envelope.clientActionId,
  accepted: applied.errors.length === 0,
  stateSeq: applied.stateSeq,
  actionSeq: applied.actionSeq,
  ...(applied.snapshot === undefined ? {} : { snapshot: applied.snapshot }),
  errors: applied.errors,
});

const rejectedResult = (
  envelope: ClientActionEnvelope,
  stateSeq: number,
  reason: ActionRejectionReason,
  message: string,
): SessionActionResult => ({
  type: "actionResult",
  matchId: envelope.matchId,
  clientActionId: envelope.clientActionId,
  accepted: false,
  stateSeq,
  reason,
  errors: [message],
});

const applyRequest = (
  local: LocalDevMatch,
  request: SessionActionRequest,
  includeSnapshot: boolean,
): ReturnType<typeof applyLocalDevAction> => {
  switch (request.type) {
    case "submitAction":
      return applyLocalDevAction(local, {
        ...request,
        includeSnapshot,
      });
    case "respondToDecision":
      return applyLocalDevDecision(local, {
        ...request,
        includeSnapshot,
      });
    case "requestRollback":
      return requestLocalDevRollback(local, request);
    case "cancelRollback":
      return cancelLocalDevRollback(local, request);
  }
};

const requestExpectedStateSeq = (
  request: SessionActionRequest,
): number | undefined =>
  request.type === "respondToDecision" ? undefined : request.expectedStateSeq;

const compactSessionResult = (
  result: SessionActionResult,
): SessionActionResult => {
  if (result.snapshot === undefined) {
    return result;
  }
  return {
    type: result.type,
    matchId: result.matchId,
    clientActionId: result.clientActionId,
    accepted: result.accepted,
    stateSeq: result.stateSeq,
    ...(result.actionSeq === undefined ? {} : { actionSeq: result.actionSeq }),
    ...(result.reason === undefined ? {} : { reason: result.reason }),
    errors: result.errors,
  };
};

const compactStoredSessionRecord = (
  record: StoredSessionRecord,
): StoredSessionRecord => ({
  envelope: record.envelope,
  result: compactSessionResult(record.result),
  recordedAt: record.recordedAt,
});

const sortedStoredRecords = (
  records: readonly StoredSessionRecord[],
): StoredSessionRecord[] =>
  [...records].sort((left, right) => {
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

export const createMatchSessionRuntime = ({
  local,
  metadata,
  persistence,
  initialRecords,
  recoveryContext,
  includeActionSnapshots = true,
  now = () => new Date().toISOString(),
}: CreateMatchSessionRuntimeOptions): MatchSessionRuntime => {
  const idempotency = new Map<string, StoredSessionRecord>();
  const initialActions =
    initialRecords?.actions?.map(compactStoredSessionRecord) ?? [];
  const initialDecisions =
    initialRecords?.decisions?.map(compactStoredSessionRecord) ?? [];
  const records: StoredSessionRecord[] = sortedStoredRecords([
    ...initialActions,
    ...initialDecisions,
  ]);
  const deterministicRecords: StoredDeterministicSessionRecord[] = [];
  const deterministicCheckpoints: StoredDeterministicCheckpointRecord[] = [];
  const pendingActions: StoredSessionRecord[] = [];
  const pendingDecisions: StoredSessionRecord[] = [];
  const pendingDeterministicRecords: StoredDeterministicSessionRecord[] = [];

  for (const record of records) {
    idempotency.set(
      idempotencyKey({
        matchId: record.envelope.matchId,
        playerId: record.envelope.playerId,
        clientActionId: record.envelope.clientActionId,
      }),
      record,
    );
  }

  const storeRecord = (
    envelope: ClientActionEnvelope,
    result: SessionActionResult,
    recordedAt: string,
  ): SessionActionResult => {
    const record: StoredSessionRecord = {
      envelope,
      result,
      recordedAt,
    };
    const compactRecord = compactStoredSessionRecord(record);
    idempotency.set(
      idempotencyKey({
        matchId: envelope.matchId,
        playerId: envelope.playerId,
        clientActionId: envelope.clientActionId,
      }),
      record,
    );
    records.push(record);
    if (result.accepted) {
      if (envelope.request.type === "respondToDecision") {
        pendingDecisions.push(compactRecord);
      } else {
        pendingActions.push(compactRecord);
      }
    }
    return result;
  };

  return {
    applyEnvelope(envelope) {
      const key = idempotencyKey({
        matchId: envelope.matchId,
        playerId: envelope.playerId,
        clientActionId: envelope.clientActionId,
      });
      const existing = idempotency.get(key);
      if (existing !== undefined) {
        if (existing.envelope.requestHash === envelope.requestHash) {
          return existing.result;
        }
        return rejectedResult(
          envelope,
          local.state.seq,
          "idempotencyConflict",
          "Client action id was reused with a different request hash.",
        );
      }

      if (
        envelope.matchId !== local.state.matchId ||
        envelope.playerId !== envelope.request.playerId ||
        (requestExpectedStateSeq(envelope.request) !== undefined &&
          requestExpectedStateSeq(envelope.request) !==
            envelope.expectedStateSeq)
      ) {
        return rejectedResult(
          envelope,
          local.state.seq,
          "illegalAction",
          "Action envelope does not match its request context.",
        );
      }

      const actualHash = requestHash(envelope.request);
      if (actualHash !== envelope.requestHash) {
        return rejectedResult(
          envelope,
          local.state.seq,
          "illegalAction",
          "Request hash does not match the action request payload.",
        );
      }
      if (envelope.expectedStateSeq < local.state.seq) {
        return rejectedResult(
          envelope,
          local.state.seq,
          "staleState",
          "Action request expected an older state sequence.",
        );
      }
      if (envelope.expectedStateSeq > local.state.seq) {
        return rejectedResult(
          envelope,
          local.state.seq,
          "futureState",
          "Action request expected a future state sequence.",
        );
      }
      if (
        envelope.request.type === "respondToDecision" &&
        local.state.pendingDecision?.id !== envelope.expectedDecisionId
      ) {
        return rejectedResult(
          envelope,
          local.state.seq,
          "pendingDecisionMismatch",
          "Pending decision id did not match expectedDecisionId.",
        );
      }

      const stateSeqBefore = local.state.seq;
      const actionSeqBefore = local.state.actionSeq;
      const stateHashBefore = hashReplayStateForScope(
        local.state,
        "gameplay-v1",
      );
      const applied = applyRequest(
        local,
        envelope.request,
        includeActionSnapshots,
      );
      const result = resultFromLocal(envelope, applied);
      const recordedAt = now();
      const storedResult = storeRecord(envelope, result, recordedAt);
      if (result.accepted && applied.deterministicOperation !== undefined) {
        const deterministicRecord = buildStoredDeterministicSessionRecord({
          matchId: local.state.matchId,
          entrySeq: deterministicRecords.length,
          envelope,
          result: compactSessionResult(result),
          deterministicOperation: applied.deterministicOperation,
          stateSeqBefore,
          actionSeqBefore,
          stateHashBefore,
          stateSeqAfter: local.state.seq,
          actionSeqAfter: local.state.actionSeq,
          stateHashAfter: hashReplayStateForScope(local.state, "gameplay-v1"),
          recordedAt,
        });
        deterministicRecords.push(deterministicRecord);
        pendingDeterministicRecords.push(deterministicRecord);
      }
      return storedResult;
    },
    async flushPersistence() {
      if (persistence === undefined) {
        pendingActions.length = 0;
        pendingDecisions.length = 0;
        pendingDeterministicRecords.length = 0;
        return;
      }
      while (pendingActions.length > 0) {
        const record = pendingActions[0];
        if (record === undefined) {
          break;
        }
        await persistence.appendAction({
          matchId: record.envelope.matchId,
          record,
        });
        pendingActions.shift();
      }
      while (pendingDecisions.length > 0) {
        const record = pendingDecisions[0];
        if (record === undefined) {
          break;
        }
        await persistence.appendDecision({
          matchId: record.envelope.matchId,
          record,
        });
        pendingDecisions.shift();
      }
    },
    async saveSnapshot() {
      if (persistence === undefined || metadata === undefined) {
        return;
      }
      const context = recoveryContext?.();
      await persistence.saveSnapshot({
        metadata,
        state: local.state,
        manifest: local.state.cardManifest,
        ...(context === undefined ? {} : { recoveryContext: context }),
        actions: [],
        decisions: [],
      });
      pendingActions.length = 0;
      pendingDecisions.length = 0;
      pendingDeterministicRecords.length = 0;
    },
    records: () => records,
    deterministicRecords: () => deterministicRecords,
    deterministicCheckpoints: () => deterministicCheckpoints,
  };
};

export const currentSessionSnapshot = getLocalDevSnapshot;
