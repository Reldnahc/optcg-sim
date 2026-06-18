import type { EffectQueueEntry } from "@optcg/types";

export type UnsupportedPendingRuntimeWorkGate =
  | "queue-ordering"
  | "queue-entry-resolution"
  | "queue-source-presence"
  | "queue-effect-definition"
  | "deferred-trigger-release";

export interface EffectQueuePendingRuntimeWork {
  kind: "effectQueue";
  count: number;
  gate?: UnsupportedPendingRuntimeWorkGate;
  queueEntryId?: string;
  effectId?: string;
  queueReason?: string;
}

export interface UnsupportedEffectQueueContext {
  readonly gate: UnsupportedPendingRuntimeWorkGate;
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

export const createUnsupportedEffectQueueWork = (
  count: number,
  context?: UnsupportedEffectQueueContext,
): EffectQueuePendingRuntimeWork => ({
  kind: "effectQueue",
  count,
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
});
