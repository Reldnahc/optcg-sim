import type {
  CardInstance,
  CausalityRef,
  EngineEvent,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEvent } from "../action-results.js";
import { reindexZoneCards } from "../actions/state.js";

export const moveFieldCardToOwnerDeckBottom = (params: {
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
  const deckCard = { ...params.card, attachedDon: [] };
  delete deckCard.state;
  const nextDeck = reindexZoneCards(
    [...player.deck, deckCard],
    "deck",
    params.playerId,
    "deck",
  );
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
    deck: nextDeck,
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
  const moved = nextDeck.find(
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
