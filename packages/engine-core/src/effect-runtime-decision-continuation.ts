import type { EngineError, EngineResult, GameState } from "@optcg/types";

import { toEngineResult } from "./action-results.js";
import { processEffectRuntime } from "./effect-runtime.js";

const nonEmptyErrors = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  if (first === undefined) {
    return [{ type: "illegalAction", reason: "Runtime failed without error." }];
  }
  return [first, ...errors.slice(1)];
};

export const continueRuntimeAfterDecisionResult = (
  originalState: GameState,
  result: EngineResult,
): EngineResult => {
  if (
    result.errors !== undefined ||
    result.state.pendingDecision !== undefined
  ) {
    return result;
  }

  return continueRuntimeUntilIdle(originalState, result);
};

export const continueRuntimeUntilIdle = (
  originalState: GameState,
  result: EngineResult,
): EngineResult => {
  let current = result;
  for (let stepCount = 0; stepCount < 20; stepCount += 1) {
    if (
      current.errors !== undefined ||
      current.state.pendingDecision !== undefined ||
      current.state.status.type !== "active"
    ) {
      return current;
    }
    const next = processEffectRuntime(current.state);
    if (next.errors !== undefined) {
      return toEngineResult(originalState, [], nonEmptyErrors(next.errors));
    }
    if (next.events.length === 0) {
      if (next.stateHash !== current.stateHash) {
        current = toEngineResult(next.state, current.events);
        continue;
      }
      return current;
    }
    current = toEngineResult(next.state, [...current.events, ...next.events]);
  }
  return toEngineResult(
    originalState,
    [],
    [{ type: "illegalAction", reason: "Runtime continuation did not settle." }],
  );
};
