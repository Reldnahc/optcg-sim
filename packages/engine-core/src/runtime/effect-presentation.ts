import type {
  ActiveEffectTextPresentation,
  CardRef,
  EffectDefinition,
  EffectQueueEntry,
  EffectTextSourceMap,
  EffectTextSpanId,
  ResolvedCard,
} from "@optcg/types";

const costSpanPrefix = "span:cost";
const searchRevealRemainingSpanPrefix = "span:search:remaining";
const searchRevealSelectionSpanPrefix = "span:search:selection";

const activeSpanIdsWithPrefix = (
  activeSpanIds: readonly EffectTextSpanId[],
  prefix: string,
): readonly EffectTextSpanId[] | undefined => {
  const narrowed = activeSpanIds.filter((spanId) => spanId.startsWith(prefix));
  return narrowed.length === 0 ? undefined : narrowed;
};

export const activeSpanIdsForCost = (
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] | undefined =>
  activeSpanIdsWithPrefix(activeSpanIds, costSpanPrefix);

export const activeSpanIdsWithoutCost = (
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] | undefined => {
  const narrowed = activeSpanIds.filter(
    (spanId) => !spanId.startsWith(costSpanPrefix),
  );
  return narrowed.length === 0 ? undefined : narrowed;
};

export const activeSpanIdsForSearchRevealRemaining = (
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] | undefined =>
  activeSpanIdsWithPrefix(activeSpanIds, searchRevealRemainingSpanPrefix);

export const activeSpanIdsForSearchRevealSelection = (
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] | undefined =>
  activeSpanIdsWithPrefix(activeSpanIds, searchRevealSelectionSpanPrefix);

export const activeSpanIdsForSequenceIndex = (
  activeSpanIds: readonly EffectTextSpanId[],
  sequenceIndex: number | string,
): readonly EffectTextSpanId[] | undefined =>
  activeSpanIdsWithPrefix(
    activeSpanIds,
    `span:sequence:${String(sequenceIndex)}:`,
  );

export const activeSpanIdsForEffectPath = ({
  sourceMap,
  effectPath,
  sequenceIndex,
}: {
  readonly sourceMap: EffectTextSourceMap | undefined;
  readonly effectPath: readonly string[];
  readonly sequenceIndex?: number;
}): EffectTextSpanId[] => {
  if (sourceMap === undefined) {
    return [];
  }

  return sourceMap.spans
    .filter((span) => {
      const samePath =
        span.effectPath === undefined ||
        (span.effectPath.length === effectPath.length &&
          span.effectPath.every((part, index) => part === effectPath[index]));
      const sameIndex =
        sequenceIndex === undefined || span.sequenceIndex === sequenceIndex;
      return (
        samePath &&
        sameIndex &&
        (span.role === "body" ||
          span.role === "cost" ||
          span.role === "choiceOption")
      );
    })
    .map((span) => span.id);
};

export const activeEffectTextPresentationForEffectBlock = ({
  effectBlock,
  resolvedCard,
  source,
}: {
  readonly effectBlock: EffectDefinition["effects"][number];
  readonly resolvedCard: ResolvedCard;
  readonly source: CardRef;
}): ActiveEffectTextPresentation | undefined => {
  const fallbackTextKind =
    effectBlock.presentation?.textKind ??
    (effectBlock.trigger.type === "trigger" ? "trigger" : "effect");
  const fallbackPresentation: ActiveEffectTextPresentation = {
    source,
    textKind: fallbackTextKind,
    activeSpanIds: [],
  };
  const presentation = effectBlock.presentation;
  if (presentation === undefined) {
    return fallbackPresentation;
  }
  const sourceMap =
    presentation.textKind === "trigger"
      ? resolvedCard.triggerTextSourceMap
      : resolvedCard.effectTextSourceMap;
  if (sourceMap?.textKind !== presentation.textKind) {
    return fallbackPresentation;
  }
  const mappedSpanIds = new Set(sourceMap.spans.map((span) => span.id));
  const activeSpanIds = presentation.spanIds.filter((spanId) =>
    mappedSpanIds.has(spanId),
  );
  if (activeSpanIds.length === 0) {
    return fallbackPresentation;
  }
  return {
    source,
    textKind: presentation.textKind,
    activeSpanIds,
  };
};

export const effectQueueEntryPresentationForEffectBlock = (params: {
  readonly effectBlock: EffectDefinition["effects"][number];
  readonly resolvedCard: ResolvedCard;
  readonly source: CardRef;
}): Pick<EffectQueueEntry, "presentation"> | Record<string, never> => {
  const presentation = activeEffectTextPresentationForEffectBlock(params);
  return presentation === undefined ? {} : { presentation };
};
