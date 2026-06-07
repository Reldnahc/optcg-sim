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

const activeSpanIdsForRootSegment = (
  activeSpanIds: readonly EffectTextSpanId[],
  segment: RootChangedSegment,
): readonly EffectTextSpanId[] | undefined => {
  return activeSpanIdsForSequenceIndex(activeSpanIds, segment.key);
};

const activeSpanIdsForRootSegments = (
  activeSpanIds: readonly EffectTextSpanId[],
  segments: readonly RootChangedSegment[],
): readonly EffectTextSpanId[] | undefined => {
  const narrowed = segments.flatMap(
    (segment) => activeSpanIdsForRootSegment(activeSpanIds, segment) ?? [],
  );
  return narrowed.length === 0 ? undefined : narrowed;
};

export const entryWithCompletedSequencePresentation = (
  entry: EffectQueueEntry,
  segmentResults: EffectExecutionFrame["segmentResults"],
): EffectQueueEntry => {
  if (entry.presentation === undefined) {
    return entry;
  }
  const segments = rootChangedSegments(segmentResults);
  const activeSpanIds =
    segments.length === 0
      ? undefined
      : activeSpanIdsForRootSegments(
          entry.presentation.activeSpanIds,
          segments,
        );
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
