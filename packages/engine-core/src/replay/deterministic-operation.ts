import type {
  DeterministicCheckpoint,
  DeterministicMatchEntry,
  EngineResult,
  GameState,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import type { PreMulliganSetupGameState } from "../setup/initial-state.js";
import {
  respondToMulliganDecision,
  startMulliganFlow,
} from "../setup/mulligan.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
  enterMainPhase,
} from "../turn/phases.js";

export type DeterministicCheckpointResolver = (
  checkpointId: string,
) => DeterministicCheckpoint | undefined;

export type ApplyDeterministicOperationResult =
  | {
      readonly status: "applied";
      readonly result: EngineResult;
      readonly label: string;
    }
  | {
      readonly status: "failed";
      readonly reason: string;
    };

const hasErrors = (
  result: EngineResult,
): result is EngineResult & {
  readonly errors: NonNullable<EngineResult["errors"]>;
} => result.errors !== undefined && result.errors.length > 0;

const combinedEngineResult = (
  result: EngineResult,
  events: EngineResult["events"],
): EngineResult => ({
  ...result,
  events,
});

const advanceToMainPhase = (state: GameState): EngineResult => {
  const events: EngineResult["events"] = [];
  let current = state;
  let currentHash = "";
  for (let stepCount = 0; stepCount < 4; stepCount += 1) {
    if (
      current.turn.phase === "main" ||
      current.status.type !== "active" ||
      current.pendingDecision !== undefined ||
      current.battle !== undefined
    ) {
      return combinedEngineResult(
        { state: current, events, stateHash: currentHash },
        events,
      );
    }
    if (current.turn.phase === "refresh") {
      const result = advanceRefreshPhase(current);
      events.push(...result.events);
      if (hasErrors(result)) {
        return combinedEngineResult(result, events);
      }
      current = result.state;
      currentHash = result.stateHash;
      continue;
    }
    if (current.turn.phase === "draw") {
      const result = advanceDrawPhase(current);
      events.push(...result.events);
      if (hasErrors(result)) {
        return combinedEngineResult(result, events);
      }
      current = result.state;
      currentHash = result.stateHash;
      continue;
    }
    if (current.turn.phase === "don") {
      const donResult = advanceDonPhase(current);
      events.push(...donResult.events);
      if (hasErrors(donResult)) {
        return combinedEngineResult(donResult, events);
      }
      current = donResult.state;
      currentHash = donResult.stateHash;
      if (current.pendingDecision !== undefined) {
        continue;
      }
      const mainResult = enterMainPhase(current);
      events.push(...mainResult.events);
      if (hasErrors(mainResult)) {
        return combinedEngineResult(mainResult, events);
      }
      current = mainResult.state;
      currentHash = mainResult.stateHash;
      continue;
    }
    return combinedEngineResult(
      { state: current, events, stateHash: currentHash },
      events,
    );
  }
  return combinedEngineResult(
    { state: current, events, stateHash: currentHash },
    events,
  );
};

const startMulliganAfterSetupIfReady = (result: EngineResult): EngineResult => {
  if (
    hasErrors(result) ||
    result.state.status.type !== "setup" ||
    result.state.pendingDecision !== undefined
  ) {
    return result;
  }
  const started = startMulliganFlow(result.state as PreMulliganSetupGameState);
  return combinedEngineResult(started, [...result.events, ...started.events]);
};

const autoAdvanceMandatoryTurnFlow = (result: EngineResult): EngineResult => {
  if (hasErrors(result)) {
    return result;
  }
  const advanced = advanceToMainPhase(result.state);
  return combinedEngineResult(advanced, [...result.events, ...advanced.events]);
};

const finalizeDeterministicResult = (result: EngineResult): EngineResult =>
  autoAdvanceMandatoryTurnFlow(startMulliganAfterSetupIfReady(result));

const rollbackRequestResult = (
  state: GameState,
  entry: Extract<DeterministicMatchEntry, { readonly kind: "system" }>,
): ApplyDeterministicOperationResult => {
  const operation = entry.operation;
  if (operation.type !== "requestRollbackConsent") {
    return {
      status: "failed",
      reason: `Unsupported deterministic system operation ${operation.type}.`,
    };
  }
  const next = structuredClone(state);
  next.seq = (Number(state.seq) + 1) as GameState["seq"];
  next.pendingDecision = {
    id: operation.decisionId,
    type: "rollbackConsent",
    playerId: operation.approvingPlayerId,
    prompt: operation.prompt,
    causedBy: { type: "ruleProcess", name: "rollbackRequest" },
    visibility: {
      type: "private",
      playerId: operation.approvingPlayerId,
    },
    rollbackPointId: operation.rollbackPointId,
  };
  return {
    status: "applied",
    result: {
      state: next,
      events: [],
      stateHash: hashCanonicalStateValue(next),
    },
    label: "requestRollbackConsent",
  };
};

export const applyDeterministicOperation = (
  state: GameState,
  entry: DeterministicMatchEntry,
  checkpoints?: DeterministicCheckpointResolver,
): ApplyDeterministicOperationResult => {
  if (entry.kind === "action") {
    return {
      status: "applied",
      result: finalizeDeterministicResult(applyAction(state, entry.action)),
      label: entry.action.type,
    };
  }
  if (entry.kind === "decision") {
    const action = {
      type: "respondToDecision" as const,
      decisionId: entry.decisionId,
      response: entry.response,
    };
    const result =
      entry.response.type === "mulligan"
        ? respondToMulliganDecision(state, action)
        : applyAction(state, action);
    return {
      status: "applied",
      result: finalizeDeterministicResult(result),
      label: "respondToDecision",
    };
  }
  if (entry.operation.type === "restoreRollbackPoint") {
    const checkpoint = checkpoints?.(entry.operation.rollbackPointId);
    if (checkpoint?.snapshot === undefined) {
      return {
        status: "failed",
        reason: `Rollback checkpoint ${entry.operation.rollbackPointId} is not available.`,
      };
    }
    const restored = structuredClone(checkpoint.snapshot);
    restored.seq = entry.operation.restoredStateSeq;
    restored.actionSeq = entry.operation.restoredActionSeq;
    return {
      status: "applied",
      result: {
        state: restored,
        events: [],
        stateHash: entry.operation.restoredStateHash,
      },
      label: "restoreRollbackPoint",
    };
  }
  if (entry.operation.type === "requestRollbackConsent") {
    return rollbackRequestResult(state, entry);
  }
  const next = structuredClone(state);
  next.seq = (Number(state.seq) + 1) as GameState["seq"];
  delete next.pendingDecision;
  return {
    status: "applied",
    result: {
      state: next,
      events: [],
      stateHash: hashCanonicalStateValue(next),
    },
    label: "cancelRollbackConsent",
  };
};
