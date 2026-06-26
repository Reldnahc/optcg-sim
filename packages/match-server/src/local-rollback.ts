import type {
  DecisionId,
  EngineEvent,
  GameState,
  PlayerId,
} from "@optcg/types";

import type {
  DevRollbackPointView,
  DevRollbackView,
} from "./dev-snapshot-types.js";

export interface RequestLocalDevRollbackInput {
  playerId: PlayerId;
  rollbackPointId: string;
  expectedStateSeq?: number;
}

export interface CancelLocalDevRollbackInput {
  playerId: PlayerId;
  expectedStateSeq?: number;
}

interface LocalRollbackPoint {
  rollbackPointId: string;
  eventId?: string;
  eventSeq: number;
  stateSeq: number;
  actionSeq: number;
  label: string;
  eventJournalLength?: number;
  auditLength?: number;
  state: RollbackPointState;
}

interface LocalRollbackRequest {
  rollbackPointId: string;
  requestedBy: PlayerId;
  approvingPlayerId: PlayerId;
}

export interface LocalRollbackState {
  enabled: boolean;
  maxPoints: number;
  points: LocalRollbackPoint[];
  pendingRequest?: LocalRollbackRequest;
}

export interface LocalRollbackConfig {
  enabled?: boolean;
  maxPoints?: number;
}

export interface LocalRollbackMutationResult {
  state: GameState;
  rollback: LocalRollbackState;
  errors: string[];
}

export interface ApplyRollbackConsentInput {
  playerId: PlayerId;
  decisionId: DecisionId;
  response: { type: "rollbackConsent"; allow: boolean };
}

export const createLocalRollbackState = (
  config: LocalRollbackConfig | undefined,
): LocalRollbackState => ({
  enabled: config?.enabled ?? true,
  maxPoints: config?.maxPoints ?? 5,
  points: [],
});

type RollbackPointState = Omit<
  GameState,
  "audit" | "cardManifest" | "eventJournal"
>;

interface RollbackPointCapture {
  seq: GameState["seq"];
  actionSeq: number;
  eventJournalLength: number;
  auditLength: number;
  state: RollbackPointState;
}

type RollbackPointSource = GameState | RollbackPointCapture;

export const cloneGameStateForRollback = (
  state: GameState,
): RollbackPointCapture => {
  const { audit, cardManifest, eventJournal, ...rollbackState } = state;
  void audit;
  void cardManifest;
  void eventJournal;
  return {
    seq: state.seq,
    actionSeq: state.actionSeq,
    eventJournalLength: state.eventJournal.length,
    auditLength: state.audit.length,
    state: structuredClone(rollbackState),
  };
};

const captureRollbackPointSource = (
  source: RollbackPointSource,
): RollbackPointCapture => {
  if ("state" in source) {
    return {
      seq: source.seq,
      actionSeq: source.actionSeq,
      eventJournalLength: source.eventJournalLength,
      auditLength: source.auditLength,
      state: structuredClone(source.state),
    };
  }
  return cloneGameStateForRollback(source);
};

const nextStateSeq = (state: GameState): GameState["seq"] =>
  (Number(state.seq) + 1) as GameState["seq"];

const bumpedState = (state: GameState): GameState => ({
  ...state,
  seq: nextStateSeq(state),
});

const rollbackPointView = (
  point: LocalRollbackPoint,
): DevRollbackPointView => ({
  rollbackPointId: point.rollbackPointId,
  ...(point.eventId === undefined ? {} : { eventId: point.eventId }),
  eventSeq: point.eventSeq,
  stateSeq: point.stateSeq,
  actionSeq: point.actionSeq,
  label: point.label,
});

export const rollbackView = (
  rollback: LocalRollbackState,
  state: GameState,
): DevRollbackView => ({
  enabled: rollback.enabled,
  canRequest:
    rollback.enabled &&
    rollback.pendingRequest === undefined &&
    state.pendingDecision === undefined &&
    rollback.points.length > 0,
  points: rollback.points.map(rollbackPointView),
  ...(rollback.pendingRequest === undefined
    ? {}
    : { pendingRequest: rollback.pendingRequest }),
});

const firstPublicAnchorEvent = (
  events: readonly EngineEvent[],
): EngineEvent | undefined =>
  events.find((event) => event.visibility.type === "public") ?? events[0];

export const recordRollbackPoint = (
  rollback: LocalRollbackState,
  previousState: RollbackPointSource,
  events: readonly EngineEvent[],
): LocalRollbackState => {
  if (!rollback.enabled) {
    return rollback;
  }
  const anchor = firstPublicAnchorEvent(events);
  if (anchor === undefined) {
    return rollback;
  }
  const capture = captureRollbackPointSource(previousState);
  const point: LocalRollbackPoint = {
    rollbackPointId: `rollback:${String(capture.seq)}:${String(
      capture.actionSeq,
    )}:${String(anchor.id)}`,
    eventId: String(anchor.id),
    eventSeq: anchor.seq,
    stateSeq: capture.seq,
    actionSeq: capture.actionSeq,
    label: `Before event ${String(anchor.seq)}`,
    eventJournalLength: capture.eventJournalLength,
    auditLength: capture.auditLength,
    state: capture.state,
  };
  return {
    ...rollback,
    points: [...rollback.points, point].slice(-rollback.maxPoints),
  };
};

export const compactRollbackForState = (
  rollback: LocalRollbackState,
  state: GameState,
): LocalRollbackState => {
  if (state.status.type !== "completed" && state.status.type !== "gameOver") {
    return rollback;
  }
  if (rollback.points.length === 0 && rollback.pendingRequest === undefined) {
    return rollback;
  }
  return {
    enabled: rollback.enabled,
    maxPoints: rollback.maxPoints,
    points: [],
  };
};

const otherPlayerId = (
  state: GameState,
  playerId: PlayerId,
): PlayerId | undefined =>
  Object.keys(state.players).find((candidate) => candidate !== playerId) as
    | PlayerId
    | undefined;

const clearRollbackConsent = (state: GameState): GameState => {
  const next = bumpedState(state);
  const withoutDecision = { ...next };
  delete withoutDecision.pendingDecision;
  return withoutDecision;
};

const withoutPendingRollbackRequest = (
  rollback: LocalRollbackState,
): LocalRollbackState => ({
  enabled: rollback.enabled,
  maxPoints: rollback.maxPoints,
  points: rollback.points,
});

export const requestRollbackConsent = (
  state: GameState,
  rollback: LocalRollbackState,
  input: RequestLocalDevRollbackInput,
): LocalRollbackMutationResult => {
  if (!rollback.enabled) {
    return {
      state,
      rollback,
      errors: ["Rollback is not enabled for this match."],
    };
  }
  if (
    input.expectedStateSeq !== undefined &&
    input.expectedStateSeq !== state.seq
  ) {
    return {
      state,
      rollback,
      errors: [
        `Rollback request is stale for ${String(
          input.playerId,
        )}; refresh the current match state.`,
      ],
    };
  }
  if (rollback.pendingRequest !== undefined) {
    return {
      state,
      rollback,
      errors: ["A rollback request is already pending."],
    };
  }
  if (state.pendingDecision !== undefined) {
    return {
      state,
      rollback,
      errors: ["Cannot request rollback while a decision is pending."],
    };
  }
  const point = rollback.points.find(
    (candidate) => candidate.rollbackPointId === input.rollbackPointId,
  );
  if (point === undefined) {
    return {
      state,
      rollback,
      errors: ["Requested rollback point is not available."],
    };
  }
  const approvingPlayerId = otherPlayerId(state, input.playerId);
  if (approvingPlayerId === undefined) {
    return {
      state,
      rollback,
      errors: ["Rollback consent requires another player."],
    };
  }

  const decisionId = `decision:rollback:${input.rollbackPointId}:${String(
    state.seq,
  )}` as DecisionId;
  return {
    state: bumpedState({
      ...state,
      pendingDecision: {
        id: decisionId,
        type: "rollbackConsent",
        playerId: approvingPlayerId,
        prompt: `Allow rollback to ${point.label}?`,
        causedBy: { type: "ruleProcess", name: "rollbackRequest" },
        visibility: { type: "private", playerId: approvingPlayerId },
        rollbackPointId: input.rollbackPointId,
      },
    }),
    rollback: {
      ...rollback,
      pendingRequest: {
        rollbackPointId: input.rollbackPointId,
        requestedBy: input.playerId,
        approvingPlayerId,
      },
    },
    errors: [],
  };
};

export const resolveRollbackConsent = (
  state: GameState,
  rollback: LocalRollbackState,
  input: ApplyRollbackConsentInput,
): LocalRollbackMutationResult => {
  const request = rollback.pendingRequest;
  const decision = state.pendingDecision;
  if (
    request === undefined ||
    decision === undefined ||
    decision.type !== "rollbackConsent" ||
    decision.id !== input.decisionId ||
    decision.rollbackPointId !== request.rollbackPointId
  ) {
    return {
      state,
      rollback,
      errors: ["No matching rollback request is pending."],
    };
  }
  if (!input.response.allow) {
    return {
      state: clearRollbackConsent(state),
      rollback: withoutPendingRollbackRequest(rollback),
      errors: [],
    };
  }

  const point = rollback.points.find(
    (candidate) => candidate.rollbackPointId === request.rollbackPointId,
  );
  if (point === undefined) {
    return {
      state,
      rollback,
      errors: ["Requested rollback point is no longer available."],
    };
  }

  const legacyState = point.state as RollbackPointState &
    Partial<Pick<GameState, "audit" | "eventJournal">>;
  const eventJournalLength =
    point.eventJournalLength ?? legacyState.eventJournal?.length ?? 0;
  const auditLength = point.auditLength ?? legacyState.audit?.length ?? 0;
  const restored: GameState = {
    ...structuredClone(point.state),
    cardManifest: state.cardManifest,
    eventJournal: state.eventJournal.slice(0, eventJournalLength),
    audit: state.audit.slice(0, auditLength),
  };
  restored.seq = (Number(state.seq) + 1) as GameState["seq"];
  restored.actionSeq = state.actionSeq + 1;
  return {
    state: restored,
    rollback: {
      ...withoutPendingRollbackRequest(rollback),
      points: rollback.points.filter(
        (candidate) => candidate.stateSeq <= point.stateSeq,
      ),
    },
    errors: [],
  };
};

export const cancelRollbackConsent = (
  state: GameState,
  rollback: LocalRollbackState,
  input: CancelLocalDevRollbackInput,
): LocalRollbackMutationResult => {
  if (
    input.expectedStateSeq !== undefined &&
    input.expectedStateSeq !== state.seq
  ) {
    return {
      state,
      rollback,
      errors: [
        `Rollback cancellation is stale for ${String(
          input.playerId,
        )}; refresh the current match state.`,
      ],
    };
  }
  const request = rollback.pendingRequest;
  if (request === undefined) {
    return {
      state,
      rollback,
      errors: ["No rollback request is pending."],
    };
  }
  if (request.requestedBy !== input.playerId) {
    return {
      state,
      rollback,
      errors: ["Only the rollback requester can cancel the request."],
    };
  }
  return {
    state: clearRollbackConsent(state),
    rollback: withoutPendingRollbackRequest(rollback),
    errors: [],
  };
};
