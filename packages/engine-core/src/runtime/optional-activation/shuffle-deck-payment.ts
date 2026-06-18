import type {
  EngineEvent,
  GameState,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import { appendEvent } from "../../action-results.js";
import { shuffleDeterministic } from "../../state/shuffle.js";

export const applyShuffleDeckPayment = (params: {
  readonly decisionId: NonNullable<GameState["pendingDecision"]>["id"];
  readonly player: PlayerState;
  readonly playerId: PlayerId;
  readonly state: GameState;
}): {
  readonly costPaidPayload: {
    readonly playerId: PlayerId;
    readonly optionId: "shuffleDeck";
  };
  readonly events: readonly EngineEvent[];
  readonly player: PlayerState;
  readonly state: GameState;
} => {
  const shuffled = shuffleDeterministic(params.player.deck, params.state.rng);
  const player = {
    ...params.player,
    deck: shuffled.items.map((card, deckIndex) => ({
      ...card,
      zone: {
        zone: "deck" as const,
        playerId: params.playerId,
        slot: "deck" as const,
        index: deckIndex,
      },
    })),
  };
  const state = { ...params.state, rng: shuffled.rng };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "deckShuffled",
    { playerId: params.playerId, count: player.deck.length },
    { type: "public" },
  );
  const event = events[events.length - 1];
  if (event !== undefined) {
    event.causedBy = { type: "decision", decisionId: params.decisionId };
  }

  return {
    costPaidPayload: {
      playerId: params.playerId,
      optionId: "shuffleDeck",
    },
    events,
    player,
    state,
  };
};
