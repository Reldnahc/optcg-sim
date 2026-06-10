import type { EffectQueueEntry } from "@optcg/types";

export const lifeTriggerQueueOrigin = { type: "lifeTrigger" } as const;

export const isLifeTriggerQueueEntry = (entry: EffectQueueEntry): boolean =>
  entry.queueOrigin?.type === "lifeTrigger";
