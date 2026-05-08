import type { EffectQueueEntry } from "@optcg/types";

import type { EffectQueueGroup } from "./effect-queue-ordering.js";
import {
  findEarliestChoiceRequiredEffectQueueGroup,
  groupValidatedEffectQueueEntries,
  orderNoChoiceEffectQueueGroups,
  validateEffectQueueOrderingInput,
} from "./effect-queue-ordering.js";

export interface QueueOrderingEvaluation {
  ok: true;
  groups: readonly EffectQueueGroup[];
  earliestChoiceGroup: EffectQueueGroup | undefined;
}

export const inferTimingWindowRanks = (
  entries: readonly EffectQueueEntry[],
): Array<{
  timingWindowId: EffectQueueEntry["timingWindowId"];
  rank: number;
}> => {
  const minCreatedAtSeqByWindow = new Map<
    EffectQueueEntry["timingWindowId"],
    number
  >();
  for (const entry of entries) {
    const existing = minCreatedAtSeqByWindow.get(entry.timingWindowId);
    if (existing === undefined || entry.createdAtEventSeq < existing) {
      minCreatedAtSeqByWindow.set(
        entry.timingWindowId,
        entry.createdAtEventSeq,
      );
    }
  }

  return [...minCreatedAtSeqByWindow.entries()]
    .sort((left, right) => {
      const seqDifference = left[1] - right[1];
      if (seqDifference !== 0) {
        return seqDifference;
      }
      if (left[0] < right[0]) {
        return -1;
      }
      if (left[0] > right[0]) {
        return 1;
      }
      return 0;
    })
    .map(([timingWindowId], rank) => ({ timingWindowId, rank }));
};

export const evaluateQueueOrdering = (
  entries: readonly EffectQueueEntry[],
): QueueOrderingEvaluation | { ok: false } => {
  const validated = validateEffectQueueOrderingInput(
    entries,
    inferTimingWindowRanks(entries),
  );
  if (!validated.ok) {
    return { ok: false };
  }
  const groups = groupValidatedEffectQueueEntries(validated);
  return {
    ok: true,
    groups,
    earliestChoiceGroup: findEarliestChoiceRequiredEffectQueueGroup(groups),
  };
};

export const orderNoChoiceQueueEntries = (
  groups: readonly EffectQueueGroup[],
): ReturnType<typeof orderNoChoiceEffectQueueGroups> =>
  orderNoChoiceEffectQueueGroups(groups);
