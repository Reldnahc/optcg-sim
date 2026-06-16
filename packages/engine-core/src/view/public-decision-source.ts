import type {
  ActiveEffectTextPresentation,
  CardInstance,
  CardRef,
  EffectQueueEntry,
  GameState,
  PendingDecision,
  PlayerId,
} from "@optcg/types";

import { toCardRef, zonesEqual } from "../actions/state.js";
import {
  activeSpanIdsForChoice,
  activeSpanIdsForChoiceOptionIndex,
  activeSpanIdsForCost,
  activeSpanIdsForSearchRemaining,
  activeSpanIdsForSearchSelection,
  activeSpanIdsForSequenceIndex,
} from "../runtime/effect-presentation.js";

export interface VisibleDecisionSourceCard {
  card: CardInstance;
  playerId: PlayerId;
}

const visibleEffectQueueEntryForDecision = ({
  state,
  pending,
  playerId,
  visibleCards,
}: {
  state: GameState;
  pending: PendingDecision;
  playerId: PlayerId;
  visibleCards: readonly VisibleDecisionSourceCard[];
}): { entry: EffectQueueEntry; source: CardRef } | undefined => {
  const causedBy = pending.causedBy;
  if (causedBy.type !== "effect") {
    return undefined;
  }
  const entry = state.effectQueue.find(
    (candidate) => candidate.id === causedBy.queueEntryId,
  );
  if (entry === undefined) {
    return undefined;
  }
  const visibleByInstanceId = new Map(
    visibleCards.map((visible) => [visible.card.instanceId, visible]),
  );
  const visible = visibleByInstanceId.get(entry.source.instanceId);
  if (visible !== undefined) {
    return { entry, source: toCardRef(visible.card, visible.playerId) };
  }
  if (!isRevealedSourceVisible(state, playerId, entry.source)) {
    return undefined;
  }
  return { entry, source: entry.source };
};

const isRevealedSourceVisible = (
  state: GameState,
  playerId: PlayerId,
  source: CardRef,
): boolean =>
  state.revealedCards.some(
    (record) =>
      (record.visibility.type === "public" ||
        (record.visibility.type === "private" &&
          record.visibility.playerId === playerId)) &&
      record.cards.some(
        (card) =>
          card.instanceId === source.instanceId &&
          card.cardId === source.cardId &&
          card.playerId === source.playerId &&
          (source.zone === undefined ||
            (card.zone !== undefined && zonesEqual(card.zone, source.zone))),
      ),
  );

export const publicDecisionSourceFromEffectQueue = (params: {
  state: GameState;
  pending: PendingDecision;
  playerId: PlayerId;
  visibleCards: readonly VisibleDecisionSourceCard[];
}): CardRef | undefined => visibleEffectQueueEntryForDecision(params)?.source;

const rootSequenceEffectPath = ["effect", "sequence"] as const;

const topLevelSequenceIndexForDecision = (
  state: GameState,
  pending: PendingDecision,
): number | undefined => {
  const frame = state.effectExecutionFrames.find(
    (candidate) =>
      candidate.pendingDecision.decisionId === pending.id &&
      (pending.causedBy.type !== "effect" ||
        candidate.queueEntryId === pending.causedBy.queueEntryId),
  );
  if (frame === undefined) {
    return undefined;
  }
  if (
    frame.effectPath.length < rootSequenceEffectPath.length ||
    !rootSequenceEffectPath.every(
      (part, index) => frame.effectPath[index] === part,
    )
  ) {
    return undefined;
  }
  if (frame.effectPath.length === rootSequenceEffectPath.length) {
    return frame.pendingDecision.resumeAtSegmentIndex;
  }
  const topLevelIndex = Number(frame.effectPath[rootSequenceEffectPath.length]);
  return Number.isSafeInteger(topLevelIndex) && topLevelIndex >= 0
    ? topLevelIndex
    : undefined;
};

const choiceOptionIndexForDecision = (
  state: GameState,
  pending: PendingDecision,
): number | undefined => {
  const frame = state.effectExecutionFrames.find(
    (candidate) =>
      candidate.pendingDecision.decisionId === pending.id &&
      (pending.causedBy.type !== "effect" ||
        candidate.queueEntryId === pending.causedBy.queueEntryId),
  );
  if (frame === undefined) {
    return undefined;
  }
  for (let index = frame.effectPath.length - 2; index >= 1; index -= 1) {
    if (frame.effectPath[index] !== "choice") {
      continue;
    }
    const optionIndex = Number(frame.effectPath[index + 1]);
    return Number.isSafeInteger(optionIndex) && optionIndex >= 0
      ? optionIndex
      : undefined;
  }
  return undefined;
};

const narrowSequenceActiveSpanIds = (
  state: GameState,
  pending: PendingDecision,
  activeSpanIds: ActiveEffectTextPresentation["activeSpanIds"],
): ActiveEffectTextPresentation["activeSpanIds"] | undefined => {
  const topLevelIndex = topLevelSequenceIndexForDecision(state, pending);
  return topLevelIndex === undefined
    ? undefined
    : activeSpanIdsForSequenceIndex(activeSpanIds, topLevelIndex);
};

const narrowChoiceOptionActiveSpanIds = (
  state: GameState,
  pending: PendingDecision,
  activeSpanIds: ActiveEffectTextPresentation["activeSpanIds"],
): ActiveEffectTextPresentation["activeSpanIds"] | undefined => {
  const optionIndex = choiceOptionIndexForDecision(state, pending);
  return optionIndex === undefined
    ? undefined
    : activeSpanIdsForChoiceOptionIndex(activeSpanIds, optionIndex);
};

const narrowPayCostActiveSpanIds = (
  pending: PendingDecision,
  activeSpanIds: ActiveEffectTextPresentation["activeSpanIds"],
): ActiveEffectTextPresentation["activeSpanIds"] | undefined => {
  if (pending.type !== "payCost") {
    return undefined;
  }
  return activeSpanIdsForCost(activeSpanIds);
};

const narrowSearchActiveSpanIds = (
  pending: PendingDecision,
  activeSpanIds: ActiveEffectTextPresentation["activeSpanIds"],
): ActiveEffectTextPresentation["activeSpanIds"] | undefined => {
  if (pending.type === "selectCards") {
    return activeSpanIdsForSearchSelection(activeSpanIds);
  }
  if (pending.type === "orderCards") {
    return activeSpanIdsForSearchRemaining(activeSpanIds);
  }
  return undefined;
};

const narrowChoiceActiveSpanIds = (
  pending: PendingDecision,
  activeSpanIds: ActiveEffectTextPresentation["activeSpanIds"],
): ActiveEffectTextPresentation["activeSpanIds"] | undefined => {
  if (pending.type !== "chooseEffectOption") {
    return undefined;
  }
  return activeSpanIdsForChoice(activeSpanIds);
};

export const publicDecisionActiveEffectTextFromEffectQueue = (params: {
  state: GameState;
  pending: PendingDecision;
  playerId: PlayerId;
  visibleCards: readonly VisibleDecisionSourceCard[];
}): ActiveEffectTextPresentation | undefined => {
  const visible = visibleEffectQueueEntryForDecision(params);
  if (visible?.entry.presentation === undefined) {
    return undefined;
  }
  const activeSpanIds =
    narrowPayCostActiveSpanIds(
      params.pending,
      visible.entry.presentation.activeSpanIds,
    ) ??
    narrowSearchActiveSpanIds(
      params.pending,
      visible.entry.presentation.activeSpanIds,
    ) ??
    narrowChoiceActiveSpanIds(
      params.pending,
      visible.entry.presentation.activeSpanIds,
    ) ??
    narrowChoiceOptionActiveSpanIds(
      params.state,
      params.pending,
      visible.entry.presentation.activeSpanIds,
    ) ??
    narrowSequenceActiveSpanIds(
      params.state,
      params.pending,
      visible.entry.presentation.activeSpanIds,
    ) ??
    visible.entry.presentation.activeSpanIds;
  if (activeSpanIds.length === 0) {
    return undefined;
  }
  return {
    ...visible.entry.presentation,
    activeSpanIds,
    source: visible.source,
  };
};
