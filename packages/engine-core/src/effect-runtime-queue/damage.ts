import type {
  Effect,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import { type EngineResultOptions, toEngineResult } from "../action-results.js";
import { executeDamagePrimitive } from "../runtime/primitives/execute.js";

type DamageEffect = Extract<Effect, { type: "damage" }>;

export type QueuedDamageResolution =
  | { status: "unsupported" }
  | {
      events: EngineEvent[];
      state: GameState;
      status: "resolved";
    }
  | {
      result: EngineResult;
      status: "pendingDecision";
    };

export const resolveQueuedDamagePrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: DamageEffect,
  priorEvents: readonly EngineEvent[],
  options: EngineResultOptions = {},
): QueuedDamageResolution => {
  const resolution = executeDamagePrimitive(state, entry, effect, options);
  if (resolution.errors !== undefined) {
    return { status: "unsupported" };
  }
  if (resolution.state.pendingDecision !== undefined) {
    return {
      result: toEngineResult(
        resolution.state,
        [...priorEvents, ...resolution.events],
        undefined,
        options,
      ),
      status: "pendingDecision",
    };
  }
  return {
    events: resolution.events,
    state: resolution.state,
    status: "resolved",
  };
};
