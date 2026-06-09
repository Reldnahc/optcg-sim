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

export const createMatchSessionRuntime = ({
  local,
  metadata,
  persistence,
  includeActionSnapshots = true,
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

      const result = resultFromLocal(
        envelope,
        applyRequest(local, envelope.request, includeActionSnapshots),
      );
      return storeRecord(envelope, result);
    },
    async flushPersistence() {
      if (persistence === undefined) {
        pendingActions.length = 0;
        pendingDecisions.length = 0;
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
