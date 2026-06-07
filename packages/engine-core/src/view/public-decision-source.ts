import type {
  ActiveEffectTextPresentation,
  CardInstance,
  CardRef,
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

export const publicDecisionActiveEffectTextFromEffectQueue = (params: {
  state: GameState;
  pending: PendingDecision;
  visibleCards: readonly VisibleDecisionSourceCard[];
}): ActiveEffectTextPresentation | undefined => {
  const visible = visibleEffectQueueEntryForDecision(params);
  if (visible?.entry.presentation === undefined) {
    return undefined;
  }
  return { ...visible.entry.presentation, source: visible.source };
};
