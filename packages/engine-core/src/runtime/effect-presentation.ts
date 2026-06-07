import type {
  ActiveEffectTextPresentation,
  CardRef,
  EffectDefinition,
  EffectTextSourceMap,
  EffectTextSpanId,
  ResolvedCard,
} from "@optcg/types";

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
  const presentation = effectBlock.presentation;
  if (presentation === undefined) {
    return undefined;
  }
  const sourceMap =
    presentation.textKind === "trigger"
      ? resolvedCard.triggerTextSourceMap
      : resolvedCard.effectTextSourceMap;
  if (sourceMap?.textKind !== presentation.textKind) {
    return undefined;
  }
  const mappedSpanIds = new Set(sourceMap.spans.map((span) => span.id));
  const activeSpanIds = presentation.spanIds.filter((spanId) =>
    mappedSpanIds.has(spanId),
  );
  if (activeSpanIds.length === 0) {
    return undefined;
  }
  return {
    source,
    textKind: presentation.textKind,
    activeSpanIds,
  };
};
