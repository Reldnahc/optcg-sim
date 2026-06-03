import type {
  CardInstance,
  CausalityRef,
  EngineEvent,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEvent } from "../action-results.js";
import { addCardsToHand, reindexZoneCards } from "../actions/state.js";

export const moveFieldCardToOwnerHand = (params: {
  card: CardInstance;
  causedBy: CausalityRef;
  events: EngineEvent[];
  playerId: PlayerId;
  sourceZone: "characterArea" | "stageArea";
  state: GameState;
}): { state: GameState } => {
  const player = params.state.players[params.playerId];
  if (player === undefined) {
    return { state: params.state };
  }

  const attachedDonIds = new Set(params.card.attachedDon);
  const nextCostArea = player.costArea.map((card) =>
    attachedDonIds.has(card.instanceId)
      ? { ...card, state: "rested" as const }
      : card,
  );
  const handCard = { ...params.card, attachedDon: [] };
  delete handCard.state;
  const nextHand = addCardsToHand(player.hand, [handCard], params.playerId);
  const nextCharacters =
    params.sourceZone === "characterArea"
      ? reindexZoneCards(
          player.characters.filter(
            (candidate) => candidate.instanceId !== params.card.instanceId,
          ),
          "characterArea",
          params.playerId,
          "character",
        )
      : player.characters;
  const nextPlayer = {
    ...player,
    characters: nextCharacters,
    costArea: nextCostArea,
    hand: nextHand,
  };
  if (
    params.sourceZone === "stageArea" &&
    player.stage?.instanceId === params.card.instanceId
  ) {
    delete nextPlayer.stage;
  }
  const nextState: GameState = {
    ...params.state,
    players: {
      ...params.state.players,
      [params.playerId]: nextPlayer,
    },
  };
  const moved = nextHand.find(
    (candidate) => candidate.instanceId === params.card.instanceId,
  );
  appendEvent(
    nextState,
    params.events,
    "cardMoved",
    {
      instanceId: params.card.instanceId,
      cardId: params.card.cardId,
      from: params.card.zone,
      to: moved?.zone,
      reason: "effect",
    },
    { type: "public" },
  );
  const event = params.events[params.events.length - 1];
  if (event !== undefined) {
    event.causedBy = params.causedBy;
  }
  return { state: nextState };
};
