import type {
  EffectExecutionFrame,
  EffectQueueEntry,
  EffectTextSpanId,
} from "@optcg/types";

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

const lastRootChangedSegment = (
  segmentResults: EffectExecutionFrame["segmentResults"],
): RootChangedSegment | undefined => rootChangedSegments(segmentResults).at(-1);

const activeSpanIdsForRootSegment = (
  activeSpanIds: readonly EffectTextSpanId[],
  segment: RootChangedSegment,
): readonly EffectTextSpanId[] | undefined => {
  const sequencePrefix = `span:sequence:${segment.key}:`;
  const narrowed = activeSpanIds.filter((spanId) =>
    spanId.startsWith(sequencePrefix),
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
  const segment = lastRootChangedSegment(segmentResults);
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
