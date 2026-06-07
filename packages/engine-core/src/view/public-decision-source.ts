import type {
  ActiveEffectTextPresentation,
  CardInstance,
  CardRef,
  EffectTextSpanId,
  EffectQueueEntry,
  GameState,
  PendingDecision,
  PlayerId,
} from "@optcg/types";

import { toCardRef } from "../actions/state.js";

export interface VisibleDecisionSourceCard {
  card: CardInstance;
  playerId: PlayerId;
}

const visibleEffectQueueEntryForDecision = ({
  state,
  pending,
  visibleCards,
}: {
  state: GameState;
  pending: PendingDecision;
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
  if (visible === undefined) {
    return undefined;
  }
  return { entry, source: toCardRef(visible.card, visible.playerId) };
};

export const publicDecisionSourceFromEffectQueue = (params: {
  state: GameState;
  pending: PendingDecision;
  visibleCards: readonly VisibleDecisionSourceCard[];
}): CardRef | undefined => visibleEffectQueueEntryForDecision(params)?.source;

const searchRevealSelectSetPrefix = "set:search-reveal:";
const searchRevealOrderDecisionPrefix = "decision:orderCards:search-reveal:";
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

const narrowSequenceActiveSpanIds = (
  state: GameState,
  pending: PendingDecision,
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] | undefined => {
  const topLevelIndex = topLevelSequenceIndexForDecision(state, pending);
  if (topLevelIndex === undefined) {
    return undefined;
  }
  const sequenceSpanPrefix = `span:sequence:${String(topLevelIndex)}:`;
  const narrowed = activeSpanIds.filter((spanId) =>
    spanId.startsWith(sequenceSpanPrefix),
  );
  return narrowed.length === 0 ? undefined : narrowed;
};

const narrowSearchRevealActiveSpanIds = (
  pending: PendingDecision,
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] | undefined => {
  const phasePrefix =
    pending.type === "selectCards" &&
    pending.request.set !== undefined &&
    String(pending.request.set).startsWith(searchRevealSelectSetPrefix)
      ? "span:search:selection"
      : pending.type === "orderCards" &&
          pending.id.startsWith(searchRevealOrderDecisionPrefix)
        ? "span:search:remaining"
        : undefined;
  if (phasePrefix === undefined) {
    return undefined;
  }
  const narrowed = activeSpanIds.filter((spanId) =>
    spanId.startsWith(phasePrefix),
  );
  return narrowed.length === 0 ? undefined : narrowed;
};

export const publicDecisionActiveEffectTextFromEffectQueue = (params: {
  state: GameState;
  pending: PendingDecision;
  visibleCards: readonly VisibleDecisionSourceCard[];
}): ActiveEffectTextPresentation | undefined => {
  const visible = visibleEffectQueueEntryForDecision(params);
  if (visible?.entry.presentation === undefined) {
    return undefined;
  }
  return {
    ...visible.entry.presentation,
    activeSpanIds:
      narrowSequenceActiveSpanIds(
        params.state,
        params.pending,
        visible.entry.presentation.activeSpanIds,
      ) ??
      narrowSearchRevealActiveSpanIds(
        params.pending,
        visible.entry.presentation.activeSpanIds,
      ) ??
      visible.entry.presentation.activeSpanIds,
    source: visible.source,
  };
};
