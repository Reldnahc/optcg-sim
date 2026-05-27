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

  const queued = processEffectRuntime(result.state);
  if (queued.errors !== undefined) {
    return toEngineResult(originalState, [], nonEmptyErrors(queued.errors));
  }
  if (queued.events.length === 0) {
    return result;
  }

  const resolved = processEffectRuntime(queued.state);
  if (resolved.errors !== undefined) {
    return toEngineResult(originalState, [], nonEmptyErrors(resolved.errors));
  }
  return toEngineResult(resolved.state, [
    ...result.events,
    ...queued.events,
    ...resolved.events,
  ]);
};
