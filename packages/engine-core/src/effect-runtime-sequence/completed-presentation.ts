import type {
  ActiveEffectTextPresentation,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  EffectTextSpanId,
} from "@optcg/types";

import {
  activeSpanIdsForChoiceOptionIndex,
  activeSpanIdsForSequenceIndex,
  activeEffectTextPresentationWithTargetLinks,
} from "../runtime/effect-presentation.js";
import { segmentPresentationSpanIdsForResultKey } from "./segment-presentation.js";

type RootChangedSegment = {
  index: number;
  key: string;
};

type ChoiceOptionChangedSegment = {
  optionIndex: number;
  key: string;
};

type PresentationMappedChangedSegment = {
  key: string;
  order: readonly number[];
  spanIds: readonly EffectTextSpanId[];
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

const orderForSegmentKey = (key: string): readonly number[] => {
  const separatorIndex = key.lastIndexOf(":");
  const indexToken = separatorIndex < 0 ? key : key.slice(separatorIndex + 1);
  const pathTokens =
    separatorIndex < 0 ? [] : key.slice(0, separatorIndex).split(".");
  return [...pathTokens, indexToken]
    .map((token) => Number(token))
    .filter((value) => Number.isSafeInteger(value) && value >= 0);
};

const compareSegmentOrder = (
  left: readonly number[],
  right: readonly number[],
): number => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? -1;
    const rightValue = right[index] ?? -1;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }
  return 0;
};

const presentationMappedChangedSegments = (
  entry: EffectQueueEntry,
  segmentResults: EffectExecutionFrame["segmentResults"],
  effectBlock: EffectDefinition["effects"][number] | undefined,
): PresentationMappedChangedSegment[] =>
  completedSegmentEntries(segmentResults)
    .flatMap(([key]) => {
      const spanIds = segmentPresentationSpanIdsForResultKey(
        effectBlock,
        entry,
        key,
      );
      return spanIds === undefined
        ? []
        : [{ key, order: orderForSegmentKey(key), spanIds }];
    })
    .sort((left, right) => compareSegmentOrder(left.order, right.order));

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

const affectedCardsForSegment = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  key: string,
) => segmentResults[key]?.affectedCards ?? [];

const singleActiveSpanTargetFallback = (
  presentation: ActiveEffectTextPresentation,
): readonly EffectTextSpanId[] | undefined =>
  presentation.activeSpanIds.length === 1
    ? presentation.activeSpanIds
    : undefined;

const segmentHasCardLinks = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  key: string,
): boolean =>
  selectedTargetsForSegment(segmentResults, key).length > 0 ||
  affectedCardsForSegment(segmentResults, key).length > 0;

const segmentsHaveCardLinks = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  segments: readonly { readonly key: string }[],
): boolean =>
  segments.some((segment) => segmentHasCardLinks(segmentResults, segment.key));

const segmentsHaveAffectedCards = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  segments: readonly { readonly key: string }[],
): boolean =>
  segments.some(
    (segment) =>
      affectedCardsForSegment(segmentResults, segment.key).length > 0,
  );

const uniqueSpanIds = (
  spanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] => {
  const seen = new Set<EffectTextSpanId>();
  const unique: EffectTextSpanId[] = [];
  for (const spanId of spanIds) {
    if (seen.has(spanId)) {
      continue;
    }
    seen.add(spanId);
    unique.push(spanId);
  }
  return unique;
};

const activeSpanIdsForPresentationMappedSegments = (
  activeSpanIds: readonly EffectTextSpanId[],
  segments: readonly PresentationMappedChangedSegment[],
): readonly EffectTextSpanId[] | undefined => {
  const availableSpanIds = new Set(activeSpanIds);
  const narrowed = uniqueSpanIds(
    segments.flatMap((segment) =>
      segment.spanIds.filter((spanId) => availableSpanIds.has(spanId)),
    ),
  );
  return narrowed.length === 0 ? undefined : narrowed;
};

const presentationWithRootTargetLinks = (
  presentation: ActiveEffectTextPresentation,
  segmentResults: EffectExecutionFrame["segmentResults"],
  segments: readonly RootChangedSegment[],
): ActiveEffectTextPresentation => {
  const hasAffectedCards = segmentsHaveAffectedCards(segmentResults, segments);
  return segments.reduce<ActiveEffectTextPresentation>(
    (nextPresentation, segment) => {
      const cards = selectedTargetsForSegment(segmentResults, segment.key);
      const affectedCards = affectedCardsForSegment(
        segmentResults,
        segment.key,
      );
      const segmentSpanIds = activeSpanIdsForRootSegment(
        presentation.activeSpanIds,
        segment,
      );
      const selectedSpanIds =
        segmentSpanIds ??
        (cards.length > 0 && !hasAffectedCards
          ? singleActiveSpanTargetFallback(presentation)
          : undefined);
      const affectedSpanIds =
        segmentSpanIds ??
        (affectedCards.length > 0
          ? singleActiveSpanTargetFallback(presentation)
          : undefined);
      const selectedPresentation = activeEffectTextPresentationWithTargetLinks({
        cards,
        presentation: nextPresentation,
        relation: "selectedTarget",
        spanIds: selectedSpanIds ?? [],
      });
      return activeEffectTextPresentationWithTargetLinks({
        cards: affectedCards,
        presentation: selectedPresentation,
        relation: "affectedCard",
        spanIds: affectedSpanIds ?? [],
      });
    },
    presentation,
  );
};

const presentationWithChoiceOptionTargetLinks = (
  presentation: ActiveEffectTextPresentation,
  segmentResults: EffectExecutionFrame["segmentResults"],
  segments: readonly ChoiceOptionChangedSegment[],
): ActiveEffectTextPresentation => {
  const hasAffectedCards = segmentsHaveAffectedCards(segmentResults, segments);
  return segments.reduce<ActiveEffectTextPresentation>(
    (nextPresentation, segment) => {
      const cards = selectedTargetsForSegment(segmentResults, segment.key);
      const affectedCards = affectedCardsForSegment(
        segmentResults,
        segment.key,
      );
      const segmentSpanIds = activeSpanIdsForChoiceOptionSegment(
        presentation.activeSpanIds,
        segment,
      );
      const selectedSpanIds =
        segmentSpanIds ??
        (cards.length > 0 && !hasAffectedCards
          ? singleActiveSpanTargetFallback(presentation)
          : undefined);
      const affectedSpanIds =
        segmentSpanIds ??
        (affectedCards.length > 0
          ? singleActiveSpanTargetFallback(presentation)
          : undefined);
      const selectedPresentation = activeEffectTextPresentationWithTargetLinks({
        cards,
        presentation: nextPresentation,
        relation: "selectedTarget",
        spanIds: selectedSpanIds ?? [],
      });
      return activeEffectTextPresentationWithTargetLinks({
        cards: affectedCards,
        presentation: selectedPresentation,
        relation: "affectedCard",
        spanIds: affectedSpanIds ?? [],
      });
    },
    presentation,
  );
};

const presentationWithMappedSegmentTargetLinks = (
  presentation: ActiveEffectTextPresentation,
  segmentResults: EffectExecutionFrame["segmentResults"],
  segments: readonly PresentationMappedChangedSegment[],
): ActiveEffectTextPresentation =>
  segments.reduce<ActiveEffectTextPresentation>((nextPresentation, segment) => {
    const selectedPresentation = activeEffectTextPresentationWithTargetLinks({
      cards: selectedTargetsForSegment(segmentResults, segment.key),
      presentation: nextPresentation,
      relation: "selectedTarget",
      spanIds: segment.spanIds,
    });
    return activeEffectTextPresentationWithTargetLinks({
      cards: affectedCardsForSegment(segmentResults, segment.key),
      presentation: selectedPresentation,
      relation: "affectedCard",
      spanIds: segment.spanIds,
    });
  }, presentation);

export const entryWithCompletedSequencePresentation = (
  entry: EffectQueueEntry,
  segmentResults: EffectExecutionFrame["segmentResults"],
  effectBlock?: EffectDefinition["effects"][number],
): EffectQueueEntry => {
  if (entry.presentation === undefined) {
    return entry;
  }
  const presentationSegments = presentationMappedChangedSegments(
    entry,
    segmentResults,
    effectBlock,
  );
  const choiceOptionSegments = choiceOptionChangedSegments(segmentResults);
  const rootSegments = rootChangedSegments(segmentResults);
  const activeSpanIds =
    activeSpanIdsForPresentationMappedSegments(
      entry.presentation.activeSpanIds,
      presentationSegments,
    ) ??
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
    (segmentsHaveCardLinks(
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
    presentationSegments.length > 0
      ? presentationWithMappedSegmentTargetLinks(
          narrowedPresentation,
          segmentResults,
          presentationSegments,
        )
      : choiceOptionSegments.length > 0
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
