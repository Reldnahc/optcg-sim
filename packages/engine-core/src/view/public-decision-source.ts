import type {
  CardInstance,
  CardRef,
  GameState,
  PendingDecision,
  PlayerId,
} from "@optcg/types";

import { toCardRef } from "../actions/state.js";

export interface VisibleDecisionSourceCard {
  card: CardInstance;
  playerId: PlayerId;
}

export const publicDecisionSourceFromEffectQueue = ({
  state,
  pending,
  visibleCards,
}: {
  state: GameState;
  pending: PendingDecision;
  visibleCards: readonly VisibleDecisionSourceCard[];
}): CardRef | undefined => {
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
  return visible === undefined
    ? undefined
    : toCardRef(visible.card, visible.playerId);
};
