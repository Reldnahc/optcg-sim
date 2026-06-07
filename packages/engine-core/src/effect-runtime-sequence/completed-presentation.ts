import type {
  EffectExecutionFrame,
  EffectQueueEntry,
  EffectTextSpanId,
} from "@optcg/types";

import { activeSpanIdsForSequenceIndex } from "../runtime/effect-presentation.js";

type RootChangedSegment = {
  index: number;
  key: string;
};

const rootChangedSegments = (
  segmentResults: EffectExecutionFrame["segmentResults"],
): RootChangedSegment[] =>
  Object.entries(segmentResults)
    .flatMap(([key, result]) => {
      const index = Number(key);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        String(index) !== key ||
        !result.attempted ||
        !result.succeeded ||
        !result.changedState
      ) {
        return [];
      }
      return [{ index, key }];
    })
    .sort((left, right) => left.index - right.index);

const firstRootChangedSegment = (
  segmentResults: EffectExecutionFrame["segmentResults"],
): RootChangedSegment | undefined => rootChangedSegments(segmentResults)[0];

const activeSpanIdsForRootSegment = (
  activeSpanIds: readonly EffectTextSpanId[],
  segment: RootChangedSegment,
): readonly EffectTextSpanId[] | undefined => {
  return activeSpanIdsForSequenceIndex(activeSpanIds, segment.key);
};

export const entryWithCompletedSequencePresentation = (
  entry: EffectQueueEntry,
  segmentResults: EffectExecutionFrame["segmentResults"],
): EffectQueueEntry => {
  if (entry.presentation === undefined) {
    return entry;
  }
  const segment = firstRootChangedSegment(segmentResults);
  const activeSpanIds =
    segment === undefined
      ? undefined
      : activeSpanIdsForRootSegment(entry.presentation.activeSpanIds, segment);
  return activeSpanIds === undefined
    ? entry
    : {
        ...entry,
        presentation: {
          ...entry.presentation,
          activeSpanIds,
        },
      };
};
