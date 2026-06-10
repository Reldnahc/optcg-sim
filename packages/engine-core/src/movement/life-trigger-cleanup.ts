import type {
  CardInstance,
  EffectQueueEntry,
  EngineEvent,
  GameState,
} from "@optcg/types";

import { toStateSeq } from "../action-results.js";
import { isLifeTriggerQueueEntry } from "../life-trigger/queue-origin.js";
import { moveConcreteCardsToTrash } from "./concrete-card-movement.js";

const isLifeTriggerResolutionEntry = (
  state: GameState,
  entry: EffectQueueEntry,
): boolean => {
  const isNoZoneSource =
    entry.source.zone?.zone === "noZone" ||
    entry.sourceSnapshot.zone.zone === "noZone";
  if (!isNoZoneSource) {
    return false;
  }
  if (!isLifeTriggerQueueEntry(entry)) {
    return false;
  }
  if (entry.causedBy.type !== "decision") {
    return false;
  }
  return state.revealedCards.some(
    (record) =>
      record.origin === "lifeDamage" &&
      record.cleanupPolicy === "trashAfterResolution" &&
      record.cards.some((card) => card.instanceId === entry.source.instanceId),
  );
};

export const cleanupResolvedLifeTrigger = (
  state: GameState,
  entry: EffectQueueEntry,
): { state: GameState; events: EngineEvent[] } => {
  if (!isLifeTriggerResolutionEntry(state, entry)) {
    return { state, events: [] };
  }
  const sourceCard: CardInstance = {
    instanceId: entry.source.instanceId,
    cardId: entry.source.cardId,
    owner: entry.sourceSnapshot.ownerId,
    controller: entry.sourceSnapshot.controllerId,
    attachedDon: [],
    zone: entry.source.zone ?? entry.sourceSnapshot.zone,
  };
  const events: EngineEvent[] = [];
  const eventBaseState: GameState = {
    ...state,
    seq: toStateSeq(state.seq - 1),
  };
  const movement = moveConcreteCardsToTrash(state, events, [sourceCard], {
    cardMovedPayloadShape: "zoneRefs",
    cardMovedVisibility: { type: "public" },
    cardTrashedVisibility: { type: "public" },
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    emitCardTrashed: true,
    eventBaseState,
    includeCardIdentityInCardMoved: true,
    playerId: entry.controllerId,
    reason: "lifeTriggerResolved",
    sourceZone: "noZone",
  });
  const nextState: GameState = {
    ...movement.state,
    revealedCards: state.revealedCards.filter(
      (record) =>
        !record.cards.some(
          (card) => card.instanceId === entry.source.instanceId,
        ),
    ),
    eventJournal: [...state.eventJournal, ...events],
  };
  return { state: nextState, events };
};
