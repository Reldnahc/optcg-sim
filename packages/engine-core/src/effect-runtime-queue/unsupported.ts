import type { EffectQueueEntry, EngineResult, GameState } from "@optcg/types";

import { type EngineResultOptions, toEngineResult } from "../action-results.js";
import type { CreateUnsupportedPendingRuntimeWorkError } from "./target-decisions.js";

export interface UnsupportedEffectQueueContext {
  readonly gate:
    | "queue-ordering"
    | "queue-entry-resolution"
    | "queue-source-presence"
    | "queue-effect-definition"
    | "deferred-trigger-release";
  readonly entry?: EffectQueueEntry;
  readonly exposeEntryIdentity?: boolean;
  readonly queueReason?: string;
}

const publicQueueIdentityZones = new Set([
  "leaderArea",
  "characterArea",
  "stageArea",
  "trash",
  "costArea",
]);

export const canExposeQueueEntryIdentity = (entry: EffectQueueEntry): boolean =>
  entry.source.zone !== undefined &&
  publicQueueIdentityZones.has(entry.source.zone.zone);

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
      createUnsupportedPendingRuntimeWorkError({
        kind: "effectQueue",
        count: state.effectQueue.length,
        ...(context?.gate === undefined ? {} : { gate: context.gate }),
        ...(context?.entry === undefined ||
        context.exposeEntryIdentity !== true ||
        !canExposeQueueEntryIdentity(context.entry)
          ? {}
          : {
              queueEntryId: String(context.entry.id),
              effectId: String(context.entry.effectBlockId),
            }),
        ...(context?.queueReason === undefined
          ? {}
          : { queueReason: context.queueReason }),
      }),
    ],
    options,
  );
