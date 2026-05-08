import type {
  CardInstance,
  EffectQueueEntry,
  EngineEvent,
  GameState,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "./action-results.js";
import { reindexZoneCards } from "./action-state.js";

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
  if (
    !String(entry.id).startsWith("queue-entry:life-trigger:") ||
    !String(entry.timingWindowId).startsWith("timing-window:life-trigger:")
  ) {
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
  const player = state.players[entry.controllerId];
  if (player === undefined) {
    return { state, events: [] };
  }
  const trashed: CardInstance = {
    instanceId: entry.source.instanceId,
    cardId: entry.source.cardId,
    owner: entry.sourceSnapshot.ownerId,
    controller: entry.sourceSnapshot.controllerId,
    attachedDon: [],
    zone: {
      zone: "trash",
      playerId: entry.controllerId,
      slot: "trash",
      index: 0,
    },
  };
  const events: EngineEvent[] = [];
  const eventBaseState: GameState = {
    ...state,
    seq: toStateSeq(state.seq - 1),
  };
  appendEvent(
    eventBaseState,
    events,
    "cardMoved",
    {
      instanceId: trashed.instanceId,
      cardId: trashed.cardId,
      from: entry.source.zone,
      to: trashed.zone,
      reason: "lifeTriggerResolved",
    },
    { type: "public" },
  );
  appendEvent(
    eventBaseState,
    events,
    "cardTrashed",
    {
      playerId: entry.controllerId,
      instanceId: trashed.instanceId,
      cardId: trashed.cardId,
      reason: "lifeTriggerResolved",
    },
    { type: "public" },
  );
  for (const event of events) {
    event.causedBy = {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    };
  }
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [entry.controllerId]: {
        ...player,
        trash: reindexZoneCards(
          [trashed, ...player.trash],
          "trash",
          entry.controllerId,
          "trash",
        ),
      },
    },
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
