import type {
  Action,
  DecisionId,
  DecisionResponse,
  EngineResult,
  GameState,
  InstanceId,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
  enterMainPhase,
} from "../turn/phases.js";
import {
  respondToMulliganDecision,
  startMulliganFlow,
} from "../setup/mulligan.js";
import type { PreMulliganSetupGameState } from "../setup/initial-state.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";

export interface ReplayArtifactStateFrame {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly state: GameState;
  readonly stateHash: string;
}

export type ReplayArtifactReconstructionResult =
  | {
      readonly status: "ready";
      readonly frames: readonly ReplayArtifactStateFrame[];
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly actionIndex?: number | undefined;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

const finalizeReplayResult = (result: EngineResult): EngineResult =>
  autoAdvanceMandatoryTurnFlow(startMulliganAfterSetupIfReady(result));

const actionWithSelectedDon = (
  action: LegalAction,
  selectedDonInstanceIds: readonly InstanceId[] | undefined,
): Action =>
  action.type === "attachDon" &&
  selectedDonInstanceIds !== undefined &&
  selectedDonInstanceIds.length > 0
    ? { ...action, selectedDonInstanceIds: [...selectedDonInstanceIds] }
    : action;

const replayActionFromEntry = (
  state: GameState,
  entry: unknown,
):
  | {
      readonly status: "ready";
      readonly result: EngineResult;
      readonly label: string;
    }
  | { readonly status: "failed"; readonly reason: string } => {
  if (!isRecord(entry) || !isRecord(entry["envelope"])) {
    return { status: "failed", reason: "Replay entry is missing an envelope." };
  }
  const request = entry["envelope"]["request"];
  if (!isRecord(request) || typeof request["type"] !== "string") {
    return {
      status: "failed",
      reason: "Replay entry is missing a request type.",
    };
  }
  const type = request["type"];
  if (
    type === "submitAction" &&
    typeof request["playerId"] === "string" &&
    typeof request["actionIndex"] === "number"
  ) {
    const playerId = request["playerId"] as PlayerId;
    if (
      state.pendingDecision?.type === "mulligan" &&
      state.pendingDecision.playerId === playerId &&
      (request["actionIndex"] === 0 || request["actionIndex"] === 1)
    ) {
      const keep = request["actionIndex"] === 0;
      return {
        status: "ready",
        result: finalizeReplayResult(
          respondToMulliganDecision(state, {
            type: "respondToDecision",
            decisionId: state.pendingDecision.id,
            response: { type: "mulligan", keep },
          }),
        ),
        label: keep ? "keepMulliganHand" : "takeMulligan",
      };
    }
    if (
      state.status.type === "active" &&
      state.pendingDecision === undefined &&
      state.battle === undefined &&
      state.turn.turnPlayerId === playerId &&
      state.turn.phase !== "main" &&
      request["actionIndex"] === 0
    ) {
      return {
        status: "ready",
        result: finalizeReplayResult(advanceToMainPhase(state)),
        label: "advanceToMainPhase",
      };
    }
    const legalActions = getLegalActions(state, playerId);
    const action = legalActions[request["actionIndex"]];
    if (action === undefined) {
      return {
        status: "failed",
        reason: `Replay submitAction index ${String(request["actionIndex"])} is not legal.`,
      };
    }
    const selectedDonInstanceIds = Array.isArray(
      request["selectedDonInstanceIds"],
    )
      ? request["selectedDonInstanceIds"].flatMap((entry) =>
          typeof entry === "string" ? [entry as InstanceId] : [],
        )
      : undefined;
    return {
      status: "ready",
      result: finalizeReplayResult(
        applyAction(
          state,
          actionWithSelectedDon(action, selectedDonInstanceIds),
        ),
      ),
      label: action.type,
    };
  }
  if (type === "endMainPhase") {
    return {
      status: "ready",
      result: finalizeReplayResult(applyAction(state, { type })),
      label: type,
    };
  }
  if (type === "playCard" && typeof request["cardInstanceId"] === "string") {
    return {
      status: "ready",
      result: finalizeReplayResult(
        applyAction(state, {
          type,
          cardInstanceId: request["cardInstanceId"] as InstanceId,
        }),
      ),
      label: type,
    };
  }
  if (type === "concede" && typeof request["playerId"] === "string") {
    return {
      status: "ready",
      result: finalizeReplayResult(
        applyAction(state, {
          type,
          playerId: request["playerId"] as PlayerId,
        }),
      ),
      label: type,
    };
  }
  if (
    type === "respondToDecision" &&
    typeof request["decisionId"] === "string" &&
    isRecord(request["response"])
  ) {
    const action: Extract<Action, { type: "respondToDecision" }> = {
      type,
      decisionId: request["decisionId"] as DecisionId,
      response: request["response"] as unknown as DecisionResponse,
    };
    const result =
      action.response.type === "mulligan"
        ? respondToMulliganDecision(state, action)
        : applyAction(state, action);
    return {
      status: "ready",
      result: finalizeReplayResult(result),
      label: type,
    };
  }
  return { status: "failed", reason: `Unsupported replay action ${type}.` };
};

export const reconstructReplayArtifactStates = ({
  deterministicEntries,
  expectedFinalStateHash,
  initialState,
}: {
  readonly initialState: GameState;
  readonly deterministicEntries: readonly unknown[];
  readonly expectedFinalStateHash?: string | undefined;
}): ReplayArtifactReconstructionResult => {
  const stateHash = hashCanonicalStateValue(initialState);
  const frames: ReplayArtifactStateFrame[] = [
    {
      index: 0,
      actionIndex: null,
      label: "Initial state",
      state: structuredClone(initialState),
      stateHash,
    },
  ];
  let current = structuredClone(initialState);
  for (const [actionIndex, entry] of deterministicEntries.entries()) {
    const decoded = replayActionFromEntry(current, entry);
    if (decoded.status === "failed") {
      return { status: "failed", reason: decoded.reason, actionIndex };
    }
    const result = decoded.result;
    if (result.errors !== undefined) {
      return {
        status: "failed",
        reason: result.errors
          .map((error) => ("reason" in error ? error.reason : error.type))
          .join("; "),
        actionIndex,
      };
    }
    current = result.state;
    frames.push({
      index: frames.length,
      actionIndex,
      label: decoded.label,
      state: structuredClone(current),
      stateHash: result.stateHash,
    });
  }
  const finalStateHash = frames.at(-1)?.stateHash ?? stateHash;
  if (
    expectedFinalStateHash !== undefined &&
    expectedFinalStateHash !== finalStateHash
  ) {
    return {
      status: "failed",
      reason: "Replay reconstruction final hash mismatch.",
    };
  }
  return { status: "ready", frames };
};
