import {
  applyLocalDevAction,
  applyLocalDevDecision,
  cancelLocalDevRollback,
  getLocalDevSnapshot,
  requestLocalDevRollback,
  type LocalDevMatch,
} from "./local-match.js";
import { idempotencyKey, requestHash } from "./action-envelope.js";
import type {
  ActionRejectionReason,
  ClientActionEnvelope,
  MatchPersistence,
  MatchSessionMetadata,
  SessionActionResult,
  SessionActionRequest,
  StoredSessionRecord,
} from "./session-types.js";

export interface MatchSessionRuntime {
  applyEnvelope: (envelope: ClientActionEnvelope) => SessionActionResult;
  flushPersistence: () => Promise<void>;
  saveSnapshot: () => Promise<void>;
  records: () => readonly StoredSessionRecord[];
}

export interface CreateMatchSessionRuntimeOptions {
  readonly local: LocalDevMatch;
  readonly metadata?: MatchSessionMetadata;
  readonly persistence?: MatchPersistence;
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
  stateSeq: applied.snapshot.stateSeq,
  actionSeq: applied.snapshot.actionSeq,
  snapshot: applied.snapshot,
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
): ReturnType<typeof applyLocalDevAction> => {
  switch (request.type) {
    case "submitAction":
      return applyLocalDevAction(local, request);
    case "respondToDecision":
      return applyLocalDevDecision(local, request);
    case "requestRollback":
      return requestLocalDevRollback(local, request);
    case "cancelRollback":
      return cancelLocalDevRollback(local, request);
  }
};

export const createMatchSessionRuntime = ({
  local,
  metadata,
  persistence,
  now = () => new Date().toISOString(),
}: CreateMatchSessionRuntimeOptions): MatchSessionRuntime => {
  const idempotency = new Map<string, StoredSessionRecord>();
  const records: StoredSessionRecord[] = [];
  const pendingActions: StoredSessionRecord[] = [];
  const pendingDecisions: StoredSessionRecord[] = [];
  const acceptedActions: StoredSessionRecord[] = [];
  const acceptedDecisions: StoredSessionRecord[] = [];

  const storeRecord = (
    envelope: ClientActionEnvelope,
    result: SessionActionResult,
  ): SessionActionResult => {
    const record: StoredSessionRecord = {
      envelope,
      result,
      recordedAt: now(),
    };
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
        pendingDecisions.push(record);
        acceptedDecisions.push(record);
      } else {
        pendingActions.push(record);
        acceptedActions.push(record);
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

      const result = resultFromLocal(
        envelope,
        applyRequest(local, envelope.request),
      );
      return storeRecord(envelope, result);
    },
    async flushPersistence() {
      if (persistence === undefined) {
        pendingActions.length = 0;
        pendingDecisions.length = 0;
        return;
      }
      for (const record of pendingActions.splice(0)) {
        await persistence.appendAction({
          matchId: record.envelope.matchId,
          record,
        });
      }
      for (const record of pendingDecisions.splice(0)) {
        await persistence.appendDecision({
          matchId: record.envelope.matchId,
          record,
        });
      }
    },
    async saveSnapshot() {
      if (persistence === undefined || metadata === undefined) {
        return;
      }
      await persistence.saveSnapshot({
        metadata,
        state: local.state,
        manifest: local.state.cardManifest,
        actions: acceptedActions,
        decisions: acceptedDecisions,
      });
    },
    records: () => records,
  };
};

export const currentSessionSnapshot = getLocalDevSnapshot;
