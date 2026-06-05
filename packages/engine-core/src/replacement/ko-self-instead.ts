import type {
  CardRef,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import { appendEvent, toEngineResult } from "../action-results.js";
import {
  KO_TRASH_MOVEMENT_REASON,
  moveConcreteCardsToTrash,
} from "../concrete-card-movement.js";

const replacementExecutionError = (
  effectId: string,
  reason: "missing-card" | "unsupported-effect-shape",
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason },
});

export const executeKoSelfInsteadEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  source: CardRef | undefined,
): EngineResult => {
  const playerId = source?.playerId ?? entry.controllerId;
  const player = state.players[playerId];
  const sourceZone = source?.zone?.zone;
  const card =
    sourceZone === "characterArea"
      ? player?.characters.find(
          (candidate) => candidate.instanceId === entry.source.instanceId,
        )
      : undefined;
  if (player === undefined || card === undefined) {
    return toEngineResult(
      state,
      [],
      [replacementExecutionError(entry.effectBlockId, "missing-card")],
    );
  }
  const events: EngineEvent[] = [];
  const attachedDonIds = new Set(card.attachedDon);
  const stateWithRestedAttachedDon: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        costArea: player.costArea.map((don) =>
          attachedDonIds.has(don.instanceId)
            ? { ...don, state: "rested" as const }
            : don,
        ),
      },
    },
  };
  appendEvent(stateWithRestedAttachedDon, events, "cardKOd", {
    playerId,
    instanceId: card.instanceId,
  });
  const moved = moveConcreteCardsToTrash(
    stateWithRestedAttachedDon,
    events,
    [card],
    {
      cardMovedPayloadShape: "zoneRefs",
      clearAttachedDon: true,
      emitCardTrashed: false,
      includeCardIdentityInCardMoved: true,
      playerId,
      reason: KO_TRASH_MOVEMENT_REASON,
      sourceZone: "characterArea",
    },
  );
  for (const donId of card.attachedDon) {
    appendEvent(
      moved.state,
      events,
      "donReturned",
      { playerId, donInstanceId: donId, state: "rested" },
      { type: "replayOnly" },
    );
  }
  return toEngineResult(moved.state, events);
};
