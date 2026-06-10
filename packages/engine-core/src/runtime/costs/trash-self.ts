import type {
  CardInstance,
  CardFilter,
  CardRef,
  DecisionId,
  EngineEvent,
  GameState,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import { appendEvent } from "../../action-results.js";
import {
  cardMatchesHandSelectionFilter,
  isSupportedHandSelectionCardFilter,
} from "../../actions/state.js";
import { moveConcreteCardsToTrash } from "../../concrete-card-movement.js";

const findTrashableSourceCard = (
  player: PlayerState,
  source: CardRef,
): { card: CardInstance; sourceZone: "characterArea" | "stageArea" } | null => {
  if (source.zone?.zone === "characterArea") {
    const character = player.characters.find(
      (card) =>
        card.instanceId === source.instanceId && card.cardId === source.cardId,
    );
    return character === undefined
      ? null
      : { card: character, sourceZone: "characterArea" };
  }
  if (
    source.zone?.zone === "stageArea" &&
    player.stage !== undefined &&
    player.stage.instanceId === source.instanceId &&
    player.stage.cardId === source.cardId
  ) {
    return { card: player.stage, sourceZone: "stageArea" };
  }
  return null;
};

export const applyTrashSelfPayment = (params: {
  readonly decisionId: DecisionId;
  readonly events: EngineEvent[];
  readonly filter?: CardFilter;
  readonly player: PlayerState;
  readonly playerId: PlayerId;
  readonly source: CardRef;
  readonly state: GameState;
}): PlayerState | null => {
  const trashable = findTrashableSourceCard(params.player, params.source);
  if (trashable === null) {
    return null;
  }
  if (
    !isSupportedHandSelectionCardFilter(params.filter) ||
    !cardMatchesHandSelectionFilter(
      params.state,
      params.playerId,
      trashable.card,
      params.filter,
    )
  ) {
    return null;
  }
  const movement = moveConcreteCardsToTrash(
    params.state,
    params.events,
    [trashable.card],
    {
      cardMovedPayloadShape: "publicZoneNames",
      cardMovedVisibility: { type: "public" },
      cardTrashedVisibility: { type: "public" },
      causedBy: { type: "decision", decisionId: params.decisionId },
      clearAttachedDon: true,
      emitCardTrashed: true,
      playerId: params.playerId,
      reason: "trashFromField",
      sourceZone: trashable.sourceZone,
    },
  );
  const movedPlayer = movement.state.players[params.playerId];
  if (movedPlayer === undefined) {
    return null;
  }
  const returnedDonIdSet = new Set(trashable.card.attachedDon);
  for (const donId of trashable.card.attachedDon) {
    appendEvent(
      params.state,
      params.events,
      "donReturned",
      {
        playerId: params.playerId,
        donInstanceId: donId,
        state: "rested",
      },
      { type: "replayOnly" },
    );
    const returnedDon = params.events[params.events.length - 1];
    if (returnedDon !== undefined) {
      returnedDon.causedBy = {
        type: "decision",
        decisionId: params.decisionId,
      };
    }
  }
  return {
    ...movedPlayer,
    costArea: movedPlayer.costArea.map((card) =>
      returnedDonIdSet.has(card.instanceId)
        ? { ...card, state: "rested" as const }
        : card,
    ),
  };
};
