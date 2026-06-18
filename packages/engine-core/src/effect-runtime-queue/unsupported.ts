import type { EngineResult, GameState } from "@optcg/types";

import { type EngineResultOptions, toEngineResult } from "../action-results.js";
import {
  createUnsupportedEffectQueueWork,
  type UnsupportedEffectQueueContext,
} from "./diagnostics.js";
import type { CreateUnsupportedPendingRuntimeWorkError } from "./target-decisions.js";

export type { UnsupportedEffectQueueContext } from "./diagnostics.js";

export const createUnsupportedEffectQueueResult = (
  state: GameState,
  createUnsupportedPendingRuntimeWorkError: CreateUnsupportedPendingRuntimeWorkError,
  options: EngineResultOptions = {},
  context?: UnsupportedEffectQueueContext,
): EngineResult =>
  toEngineResult(
    state,
    [],
    [
      createUnsupportedPendingRuntimeWorkError(
        createUnsupportedEffectQueueWork(state.effectQueue.length, context),
      ),
    ],
    options,
  );
