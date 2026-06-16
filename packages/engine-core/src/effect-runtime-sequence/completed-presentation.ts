import type {
  ActiveEffectTextPresentation,
  EffectExecutionFrame,
  EffectQueueEntry,
  EffectTextSpanId,
} from "@optcg/types";

import {
  activeSpanIdsForChoiceOptionIndex,
  activeSpanIdsForSequenceIndex,
  activeEffectTextPresentationWithTargetLinks,
} from "../runtime/effect-presentation.js";

type RootChangedSegment = {
  index: number;
  key: string;
};

type ChoiceOptionChangedSegment = {
  optionIndex: number;
  key: string;
};

const choiceOptionSegmentKeyPattern =
  /(?:^|\.)\d+\.choice\.(?<optionIndex>\d+)\.sequence:\d+$/u;

const completedSegmentEntries = (
  segmentResults: EffectExecutionFrame["segmentResults"],
): Array<[string, EffectExecutionFrame["segmentResults"][string]]> =>
  Object.entries(segmentResults).filter(
    ([, result]) => result.attempted && result.succeeded && result.changedState,
  );

const rootChangedSegments = (
  segmentResults: EffectExecutionFrame["segmentResults"],
): RootChangedSegment[] =>
  completedSegmentEntries(segmentResults)
    .flatMap(([key]) => {
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || String(index) !== key) {
        return [];
      }
      return [{ index, key }];
    })
    .sort((left, right) => left.index - right.index);

const choiceOptionChangedSegments = (
  segmentResults: EffectExecutionFrame["segmentResults"],
): ChoiceOptionChangedSegment[] =>
  completedSegmentEntries(segmentResults).flatMap(([key]) => {
    const match = choiceOptionSegmentKeyPattern.exec(key);
    const optionIndex = Number(match?.groups?.["optionIndex"]);
    if (!Number.isSafeInteger(optionIndex) || optionIndex < 0) {
      return [];
    }
    return [{ optionIndex, key }];
  });

const activeSpanIdsForRootSegment = (
  activeSpanIds: readonly EffectTextSpanId[],
  segment: RootChangedSegment,
): readonly EffectTextSpanId[] | undefined => {
  return activeSpanIdsForSequenceIndex(activeSpanIds, segment.key);
};

const activeSpanIdsForChoiceOptionSegment = (
  activeSpanIds: readonly EffectTextSpanId[],
  segment: ChoiceOptionChangedSegment,
): readonly EffectTextSpanId[] | undefined => {
  return activeSpanIdsForChoiceOptionIndex(activeSpanIds, segment.optionIndex);
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

const activeSpanIdsForChoiceOptionSegments = (
  activeSpanIds: readonly EffectTextSpanId[],
  segments: readonly ChoiceOptionChangedSegment[],
): readonly EffectTextSpanId[] | undefined => {
  const narrowed = segments.flatMap(
    (segment) =>
      activeSpanIdsForChoiceOptionSegment(activeSpanIds, segment) ?? [],
  );
  return narrowed.length === 0 ? undefined : narrowed;
};

const selectedTargetsForSegment = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  key: string,
) => segmentResults[key]?.selectedTargets ?? [];

const singleActiveSpanTargetFallback = (
  presentation: ActiveEffectTextPresentation,
): readonly EffectTextSpanId[] | undefined =>
  presentation.activeSpanIds.length === 1
    ? presentation.activeSpanIds
    : undefined;

const segmentHasSelectedTargets = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  key: string,
): boolean => selectedTargetsForSegment(segmentResults, key).length > 0;

const segmentsHaveSelectedTargets = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  segments: readonly (RootChangedSegment | ChoiceOptionChangedSegment)[],
): boolean =>
  segments.some((segment) =>
    segmentHasSelectedTargets(segmentResults, segment.key),
  );

const presentationWithRootTargetLinks = (
  presentation: ActiveEffectTextPresentation,
  segmentResults: EffectExecutionFrame["segmentResults"],
  segments: readonly RootChangedSegment[],
): ActiveEffectTextPresentation =>
  segments.reduce<ActiveEffectTextPresentation>((nextPresentation, segment) => {
    const cards = selectedTargetsForSegment(segmentResults, segment.key);
    const spanIds =
      activeSpanIdsForRootSegment(presentation.activeSpanIds, segment) ??
      (cards.length === 0
        ? undefined
        : singleActiveSpanTargetFallback(presentation));
    return activeEffectTextPresentationWithTargetLinks({
      cards,
      presentation: nextPresentation,
      relation: "selectedTarget",
      spanIds,
    });
  }, presentation);

const presentationWithChoiceOptionTargetLinks = (
  presentation: ActiveEffectTextPresentation,
  segmentResults: EffectExecutionFrame["segmentResults"],
  segments: readonly ChoiceOptionChangedSegment[],
): ActiveEffectTextPresentation =>
  segments.reduce<ActiveEffectTextPresentation>((nextPresentation, segment) => {
    const cards = selectedTargetsForSegment(segmentResults, segment.key);
    const spanIds =
      activeSpanIdsForChoiceOptionSegment(
        presentation.activeSpanIds,
        segment,
      ) ??
      (cards.length === 0
        ? undefined
        : singleActiveSpanTargetFallback(presentation));
    return activeEffectTextPresentationWithTargetLinks({
      cards,
      presentation: nextPresentation,
      relation: "selectedTarget",
      spanIds,
    });
  }, presentation);

export const entryWithCompletedSequencePresentation = (
  entry: EffectQueueEntry,
  segmentResults: EffectExecutionFrame["segmentResults"],
): EffectQueueEntry => {
  if (entry.presentation === undefined) {
    return entry;
  }
  const choiceOptionSegments = choiceOptionChangedSegments(segmentResults);
  const rootSegments = rootChangedSegments(segmentResults);
  const activeSpanIds =
    activeSpanIdsForChoiceOptionSegments(
      entry.presentation.activeSpanIds,
      choiceOptionSegments,
    ) ??
    (rootSegments.length === 0
      ? undefined
      : activeSpanIdsForRootSegments(
          entry.presentation.activeSpanIds,
          rootSegments,
        )) ??
    (segmentsHaveSelectedTargets(
      segmentResults,
      choiceOptionSegments.length > 0 ? choiceOptionSegments : rootSegments,
    )
      ? singleActiveSpanTargetFallback(entry.presentation)
      : undefined);
  if (activeSpanIds === undefined) {
    return entry;
  }
  const narrowedPresentation: ActiveEffectTextPresentation = {
    ...entry.presentation,
    activeSpanIds,
  };
  const presentation =
    choiceOptionSegments.length > 0
      ? presentationWithChoiceOptionTargetLinks(
          narrowedPresentation,
          segmentResults,
          choiceOptionSegments,
        )
      : presentationWithRootTargetLinks(
          narrowedPresentation,
          segmentResults,
          rootSegments,
        );
  return {
    ...entry,
    presentation,
  };
};
