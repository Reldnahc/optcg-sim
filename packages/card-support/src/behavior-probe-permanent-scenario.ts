import { enterMainPhase } from "@optcg/engine-core";
import type {
  CardFilter,
  EffectDefinition,
  EngineResult,
  PlayerId,
} from "@optcg/types";

import {
  fieldProbeSource,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";

const p1 = "p1" as PlayerId;

interface BehaviorProbeRunResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
}

export const runPermanentScenario = (
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
  state.turn.phase = "don";
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return {
      ok: false,
      reason: "probe card could not be fielded",
      pendingDecisionDrained: state.pendingDecision === undefined,
      effectQueueDrained: state.effectQueue.length === 0,
      eventCount: 0,
      decisionsResolved: 0,
      setupFilterCount: input.setupFilters.length,
    };
  }

  return drainRuntime(
    enterMainPhase(state, { includeStateHash: false }),
    input.setupFilters.length,
  );
};

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
