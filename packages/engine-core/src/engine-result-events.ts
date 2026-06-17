import type { EngineError, EngineEvent, EngineResult } from "@optcg/types";

import { type EngineResultOptions, toEngineResult } from "./action-results.js";

const toErrorTuple = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  return first === undefined
    ? [{ type: "illegalAction", reason: "Runtime failed without error." }]
    : [first, ...errors.slice(1)];
};

export const prependEventsToEngineResult = (
  result: EngineResult,
  events: readonly EngineEvent[],
  options: EngineResultOptions,
): EngineResult =>
  toEngineResult(
    result.state,
    [...events, ...result.events],
    result.errors === undefined ? undefined : toErrorTuple(result.errors),
    options,
  );
