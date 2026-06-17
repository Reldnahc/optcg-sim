import type { EngineResult, GameState } from "@optcg/types";

import { type EngineResultOptions, toEngineResult } from "../action-results.js";
import type { CreateUnsupportedPendingRuntimeWorkError } from "./target-decisions.js";

export const createUnsupportedEffectQueueResult = (
  state: GameState,
  createUnsupportedPendingRuntimeWorkError: CreateUnsupportedPendingRuntimeWorkError,
  options: EngineResultOptions = {},
): EngineResult =>
  toEngineResult(
    state,
    [],
    [
      createUnsupportedPendingRuntimeWorkError({
        kind: "effectQueue",
        count: state.effectQueue.length,
      }),
    ],
    options,
  );
