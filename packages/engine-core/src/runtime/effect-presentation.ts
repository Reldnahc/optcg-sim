import type {
  ActiveEffectTextPresentation,
  CardRef,
  EffectDefinition,
  EffectQueueEntry,
  EffectTextSourceMap,
  EffectTextSpanId,
  EffectTextTargetLink,
  ResolvedCard,
} from "@optcg/types";

const costSpanPrefix = "span:cost";
const choiceSpanPrefix = "span:choice";
const searchSelectionSpanPrefix = "span:search:selection";
const searchRemainingSpanPrefix = "span:search:remaining";

const activeSpanIdsWithPrefix = (
  activeSpanIds: readonly EffectTextSpanId[],
  prefix: string,
): readonly EffectTextSpanId[] | undefined => {
  const narrowed = activeSpanIds.filter((spanId) => spanId.startsWith(prefix));
  return narrowed.length === 0 ? undefined : narrowed;
};

const lineScopedSpanSuffixPattern = /:line:\d+(?::block:\d+)?$/u;

const fieldLocalSpanId = (spanId: EffectTextSpanId): EffectTextSpanId =>
  spanId.replace(lineScopedSpanSuffixPattern, "") as EffectTextSpanId;

const activeSpanIdsInSourceMap = (
  spanIds: readonly EffectTextSpanId[],
  sourceMap: EffectTextSourceMap,
): EffectTextSpanId[] => {
  const mappedSpanIds = new Set(sourceMap.spans.map((span) => span.id));
  return spanIds.flatMap((spanId) => {
    if (mappedSpanIds.has(spanId)) {
      return [spanId];
    }
    const fieldLocalId = fieldLocalSpanId(spanId);
    return fieldLocalId !== spanId && mappedSpanIds.has(fieldLocalId)
      ? [fieldLocalId]
      : [];
  });
};

export const activeSpanIdsForCost = (
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] | undefined =>
  activeSpanIdsWithPrefix(activeSpanIds, costSpanPrefix);

export const activeSpanIdsForChoice = (
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] | undefined => {
  const narrowed = activeSpanIds.filter(
    (spanId) => spanId === choiceSpanPrefix,
  );
  return narrowed.length === 0 ? [] : narrowed;
};

export const activeSpanIdsForChoiceOptionIndex = (
  activeSpanIds: readonly EffectTextSpanId[],
  optionIndex: number | string,
): readonly EffectTextSpanId[] | undefined => {
  const optionPrefix = `${choiceSpanPrefix}:${String(optionIndex)}:`;
  const narrowed = activeSpanIds.filter((spanId) =>
    spanId.startsWith(optionPrefix),
  );
  if (narrowed.length === 0) {
    return undefined;
  }
  const effectTextSpans = narrowed.filter(
    (spanId) => spanId !== `${optionPrefix}option`,
  );
  return effectTextSpans.length === 0 ? narrowed : effectTextSpans;
};

export const activeSpanIdsForSearchSelection = (
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] | undefined =>
  activeSpanIdsWithPrefix(activeSpanIds, searchSelectionSpanPrefix);

export const activeSpanIdsForSearchRemaining = (
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] | undefined =>
  activeSpanIdsWithPrefix(activeSpanIds, searchRemainingSpanPrefix);

export const activeSpanIdsWithoutCost = (
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] | undefined => {
  const narrowed = activeSpanIds.filter(
    (spanId) => !spanId.startsWith(costSpanPrefix),
  );
  return narrowed.length === 0 ? undefined : narrowed;
};

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

const conditionSpanIdsForEffectPath = ({
  sourceMap,
  effectPath,
  sequenceIndex,
}: {
  readonly sourceMap: EffectTextSourceMap | undefined;
  readonly effectPath?: readonly string[] | undefined;
  readonly sequenceIndex?: number | undefined;
}): EffectTextSpanId[] => {
  if (sourceMap === undefined) {
    return [];
  }
  return sourceMap.spans
    .filter((span) => {
      if (span.role !== "condition") {
        return false;
      }
      const samePath =
        effectPath === undefined ||
        span.effectPath === undefined ||
        (span.effectPath.length === effectPath.length &&
          span.effectPath.every((part, index) => part === effectPath[index]));
      const sameIndex =
        sequenceIndex === undefined || span.sequenceIndex === sequenceIndex;
      return samePath && sameIndex;
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
  const activeSpanIds = activeSpanIdsInSourceMap(
    presentation.spanIds,
    sourceMap,
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

export const activeEffectTextPresentationForFailedCondition = ({
  effectBlock,
  effectPath,
  resolvedCard,
  sequenceIndex,
  source,
}: {
  readonly effectBlock: EffectDefinition["effects"][number];
  readonly effectPath?: readonly string[] | undefined;
  readonly resolvedCard: ResolvedCard;
  readonly sequenceIndex?: number | undefined;
  readonly source: CardRef;
}): ActiveEffectTextPresentation | undefined => {
  const textKind =
    effectBlock.presentation?.textKind ??
    (effectBlock.trigger.type === "trigger" ? "trigger" : "effect");
  const sourceMap =
    textKind === "trigger"
      ? resolvedCard.triggerTextSourceMap
      : resolvedCard.effectTextSourceMap;
  const activeSpanIds = conditionSpanIdsForEffectPath({
    sourceMap: sourceMap?.textKind === textKind ? sourceMap : undefined,
    effectPath,
    sequenceIndex,
  });
  return {
    source,
    textKind,
    activeSpanIds,
  };
};

const cardRefKey = (card: CardRef): string =>
  [String(card.playerId), String(card.instanceId), String(card.cardId)].join(
    "|",
  );

const uniqueCardRefs = (cards: readonly CardRef[]): CardRef[] => {
  const seen = new Set<string>();
  const unique: CardRef[] = [];
  for (const card of cards) {
    const key = cardRefKey(card);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(card);
  }
  return unique;
};

const mergeTargetLinks = (
  links: readonly EffectTextTargetLink[],
): EffectTextTargetLink[] => {
  const orderedKeys: string[] = [];
  const grouped = new Map<
    string,
    {
      cards: CardRef[];
      cardKeys: Set<string>;
      relation: EffectTextTargetLink["relation"];
      spanId: EffectTextSpanId;
    }
  >();
  for (const link of links) {
    const key = `${link.spanId}|${link.relation}`;
    let group = grouped.get(key);
    if (group === undefined) {
      group = {
        spanId: link.spanId,
        relation: link.relation,
        cards: [],
        cardKeys: new Set<string>(),
      };
      grouped.set(key, group);
      orderedKeys.push(key);
    }
    for (const card of link.cards) {
      const cardKey = cardRefKey(card);
      if (group.cardKeys.has(cardKey)) {
        continue;
      }
      group.cardKeys.add(cardKey);
      group.cards.push(card);
    }
  }
  return orderedKeys.flatMap((key) => {
    const group = grouped.get(key);
    return group === undefined || group.cards.length === 0
      ? []
      : [
          {
            spanId: group.spanId,
            relation: group.relation,
            cards: group.cards,
          },
        ];
  });
};

export const activeEffectTextPresentationWithTargetLinks = ({
  cards,
  presentation,
  relation,
  spanIds = presentation.activeSpanIds,
}: {
  readonly cards: readonly CardRef[];
  readonly presentation: ActiveEffectTextPresentation;
  readonly relation: EffectTextTargetLink["relation"];
  readonly spanIds?: readonly EffectTextSpanId[] | undefined;
}): ActiveEffectTextPresentation => {
  const activeSpanIds = new Set(presentation.activeSpanIds);
  const linkSpanIds =
    uniqueCardRefs(cards).length === 0
      ? []
      : spanIds.filter((spanId) => activeSpanIds.has(spanId));
  if (linkSpanIds.length === 0) {
    return presentation;
  }
  const uniqueCards = uniqueCardRefs(cards);
  return {
    ...presentation,
    targetLinks: mergeTargetLinks([
      ...(presentation.targetLinks ?? []),
      ...linkSpanIds.map((spanId) => ({
        spanId,
        relation,
        cards: uniqueCards,
      })),
    ]),
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

export const entryWithFailedConditionPresentation = ({
  effectBlock,
  effectPath,
  entry,
  resolvedCard,
  sequenceIndex,
}: {
  readonly effectBlock: EffectDefinition["effects"][number];
  readonly effectPath?: readonly string[] | undefined;
  readonly entry: EffectQueueEntry;
  readonly resolvedCard: ResolvedCard;
  readonly sequenceIndex?: number | undefined;
}): EffectQueueEntry => {
  const presentation = activeEffectTextPresentationForFailedCondition({
    effectBlock,
    effectPath,
    resolvedCard,
    sequenceIndex,
    source: entry.source,
  });
  return presentation === undefined ? entry : { ...entry, presentation };
};
