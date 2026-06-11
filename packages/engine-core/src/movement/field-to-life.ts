import type {
  CardInstance,
  CausalityRef,
  EngineEvent,
  GameState,
  LifeCard,
  PlayerId,
} from "@optcg/types";

import { appendEvent } from "../action-results.js";
import { reindexZoneCards } from "../actions/state.js";

const reindexLife = (
  cards: readonly LifeCard[],
  playerId: PlayerId,
): LifeCard[] =>
  cards.map((lifeCard, index) => ({
    ...lifeCard,
    card: {
      ...lifeCard.card,
      zone: { zone: "life", playerId, slot: "life", index },
    },
  }));

export const moveFieldCardToOwnerLife = (params: {
  card: CardInstance;
  causedBy: CausalityRef;
  events: EngineEvent[];
  faceUp?: boolean;
  playerId: PlayerId;
  position: "top" | "bottom";
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
  const lifeCard = { ...params.card, attachedDon: [] };
  delete lifeCard.state;
  const movedLifeCard: LifeCard = {
    card: lifeCard,
    faceUp: params.faceUp === true,
  };
  const nextLife = reindexLife(
    params.position === "top"
      ? [movedLifeCard, ...player.life]
      : [...player.life, movedLifeCard],
    params.playerId,
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
    life: nextLife,
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
  const moved = nextLife.find(
    (candidate) => candidate.card.instanceId === params.card.instanceId,
  );
  appendEvent(
    nextState,
    params.events,
    "cardMoved",
    {
      instanceId: params.card.instanceId,
      cardId: params.card.cardId,
      from: params.card.zone,
      to: moved?.card.zone,
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
