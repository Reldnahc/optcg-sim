import { applyAction, getLegalActions } from "@optcg/engine-core";
import type {
  Action,
  CardFilter,
  EffectDefinition,
  EngineResult,
  PlayerId,
} from "@optcg/types";

import {
  configureProbeFieldSourceForScenario,
  fieldProbeSource,
  installProbeSourceMetadata,
  leaderProbeSource,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";

interface BehaviorProbeRunResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
}

const p1 = "p1" as PlayerId;

export const runStartOfTurnScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  state.turn.phase = "refresh";
  const player = state.players[p1];
  const source = player === undefined ? undefined : fieldProbeSource(player);
  if (source === undefined) {
    return failedScenarioResult(
      state,
      input.setupFilters.length,
      "probe card could not be fielded",
    );
  }
  configureProbeFieldSourceForScenario(state, source, input.definition.effects);
  const action = getLegalActions(state, p1).find(
    (candidate): candidate is Extract<Action, { type: "activateEffect" }> =>
      candidate.type === "activateEffect" &&
      candidate.source.instanceId === source.instanceId,
  );
  if (action === undefined) {
    return failedScenarioResult(
      state,
      input.setupFilters.length,
      "no legal start-of-turn activateEffect action",
    );
  }
  return drainRuntime(applyAction(state, action), input.setupFilters.length);
};

export const runActivateEffectScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  const player = state.players[p1];
  const source = player === undefined ? undefined : fieldProbeSource(player);
  if (source === undefined) {
    return failedScenarioResult(
      state,
      input.setupFilters.length,
      "probe card could not be fielded",
    );
  }
  configureProbeFieldSourceForScenario(state, source, input.definition.effects);

  const action = getLegalActions(state, p1).find(
    (candidate): candidate is Extract<Action, { type: "activateEffect" }> =>
      candidate.type === "activateEffect" &&
      candidate.source.instanceId === source.instanceId,
  );
  if (action !== undefined) {
    return drainRuntime(applyAction(state, action), input.setupFilters.length);
  }

  const leaderState = setupProbeMainState({ ...input, category: "leader" });
  installProbeSourceMetadata(leaderState, "leader", input.setupFilters);
  const leaderSource = leaderProbeSource(leaderState);
  leaderSource.state = "active";
  configureProbeFieldSourceForScenario(
    leaderState,
    leaderSource,
    input.definition.effects,
  );
  const leaderAction = getLegalActions(leaderState, p1).find(
    (candidate): candidate is Extract<Action, { type: "activateEffect" }> =>
      candidate.type === "activateEffect" &&
      candidate.source.instanceId === leaderSource.instanceId,
  );
  if (leaderAction !== undefined) {
    return drainRuntime(
      applyAction(leaderState, leaderAction),
      input.setupFilters.length,
    );
  }

  return failedScenarioResult(
    state,
    input.setupFilters.length,
    "no legal activateEffect action",
  );
};

const failedScenarioResult = (
  state: ReturnType<typeof setupProbeMainState>,
  setupFilterCount: number,
  reason: string,
): BehaviorProbeRunResult => ({
  ok: false,
  reason,
  pendingDecisionDrained: state.pendingDecision === undefined,
  effectQueueDrained: state.effectQueue.length === 0,
  eventCount: 0,
  decisionsResolved: 0,
  setupFilterCount,
});
