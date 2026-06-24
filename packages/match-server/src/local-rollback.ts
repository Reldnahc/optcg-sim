import type {
  DeterministicCheckpoint,
  DecisionId,
  EngineEvent,
  GameState,
  PlayerId,
} from "@optcg/types";
import { hashReplayStateForScope } from "@optcg/engine-core";

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
  state: GameState;
  checkpoint: DeterministicCheckpoint;
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
  checkpoints: DeterministicCheckpoint[];
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
  rollbackRequest?: {
    readonly rollbackPointId: string;
    readonly requestedBy: PlayerId;
    readonly approvingPlayerId: PlayerId;
    readonly decisionId: DecisionId;
    readonly prompt: string;
  };
  rollbackRestore?: {
    readonly rollbackPointId: string;
    readonly requestedBy: PlayerId;
    readonly approvedBy: PlayerId;
    readonly checkpoint: DeterministicCheckpoint;
  };
  rollbackCancel?: {
    readonly rollbackPointId: string;
    readonly playerId: PlayerId;
    readonly decisionId?: DecisionId;
  };
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
  maxPoints: config?.maxPoints ?? 40,
  points: [],
  checkpoints: [],
});

export const cloneGameState = (state: GameState): GameState =>
  structuredClone(state);

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
  previousState: GameState,
  events: readonly EngineEvent[],
): LocalRollbackState => {
  if (!rollback.enabled) {
    return rollback;
  }
  const anchor = firstPublicAnchorEvent(events);
  if (anchor === undefined) {
    return rollback;
  }
  const rollbackPointId = `rollback:${String(previousState.seq)}:${String(
    previousState.actionSeq,
  )}:${String(anchor.id)}`;
  const checkpoint: DeterministicCheckpoint = {
    checkpointVersion: "deterministic-checkpoint-v1",
    matchId: previousState.matchId,
    checkpointId: rollbackPointId,
    reason: "rollbackPoint",
    stateSeq: previousState.seq,
    actionSeq: previousState.actionSeq,
    stateHash: hashReplayStateForScope(previousState, "gameplay-v1"),
    hashScope: "gameplay-v1",
    eventId: anchor.id,
    snapshot: cloneGameState(previousState),
  };
  const point: LocalRollbackPoint = {
    rollbackPointId,
    eventId: String(anchor.id),
    eventSeq: anchor.seq,
    stateSeq: previousState.seq,
    actionSeq: previousState.actionSeq,
    label: `Before event ${String(anchor.seq)}`,
    state: cloneGameState(previousState),
    checkpoint,
  };
  return {
    ...rollback,
    points: [...rollback.points, point].slice(-rollback.maxPoints),
    checkpoints: [...rollback.checkpoints, checkpoint],
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
  checkpoints: rollback.checkpoints,
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
  const prompt = `Allow rollback to ${point.label}?`;
  return {
    state: bumpedState({
      ...state,
      pendingDecision: {
        id: decisionId,
        type: "rollbackConsent",
        playerId: approvingPlayerId,
        prompt,
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
    rollbackRequest: {
      rollbackPointId: input.rollbackPointId,
      requestedBy: input.playerId,
      approvingPlayerId,
      decisionId,
      prompt,
    },
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
      rollbackCancel: {
        rollbackPointId: request.rollbackPointId,
        playerId: input.playerId,
        decisionId: input.decisionId,
      },
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
  const checkpoint = rollback.checkpoints.find(
    (candidate) => candidate.checkpointId === point.rollbackPointId,
  );
  if (checkpoint === undefined) {
    return {
      state,
      rollback,
      errors: ["Requested rollback checkpoint is no longer available."],
    };
  }

  const restored = cloneGameState(point.state);
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
    rollbackRestore: {
      rollbackPointId: point.rollbackPointId,
      requestedBy: request.requestedBy,
      approvedBy: input.playerId,
      checkpoint,
    },
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
  const decision = state.pendingDecision;
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
    rollbackCancel: {
      rollbackPointId: request.rollbackPointId,
      playerId: input.playerId,
      ...(decision?.type === "rollbackConsent" &&
      decision.rollbackPointId === request.rollbackPointId
        ? { decisionId: decision.id }
        : {}),
    },
  };
};
