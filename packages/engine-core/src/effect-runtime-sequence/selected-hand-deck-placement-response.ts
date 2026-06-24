import type {
  Action,
  CardInstance,
  EngineError,
  EngineEvent,
  GameState,
  OrderCardsDecision,
} from "@optcg/types";

import { reindexZoneCards } from "../actions/state.js";
import { appendEvent, toStateSeq } from "../action-results.js";
import { selectedHandDeckPlacementDecisionPrefix } from "./selected-hand-deck-placement-prefix.js";

const hasDuplicateIds = (ids: readonly string[]): boolean =>
  ids.some((id, index) => ids.slice(index + 1).includes(id));

const orderedCardsFromIds = (
  activeCards: readonly CardInstance[],
  ids: readonly string[],
): CardInstance[] =>
  ids.flatMap((id) => {
    const card = activeCards.find(
      (candidate) => String(candidate.instanceId) === id,
    );
    return card === undefined ? [] : [card];
  });

const isSelectedHandDeckPlacementDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is OrderCardsDecision =>
  decision.type === "orderCards" &&
  String(decision.id).startsWith(selectedHandDeckPlacementDecisionPrefix);

export const applySelectedHandDeckPlacementDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
):
  | {
      events: EngineEvent[];
      ok: true;
      state: GameState;
    }
  | { errors: readonly [EngineError, ...EngineError[]]; ok: false }
  | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    !isSelectedHandDeckPlacementDecision(decision)
  ) {
    return null;
  }
  const fail = (reason: string) => ({
    errors: [{ type: "invalidDecisionResponse" as const, reason }] as const,
    ok: false as const,
  });
  if (action.response.type !== "topBottomPlacement") {
    return fail(
      "Response type must be topBottomPlacement for selected hand placement.",
    );
  }
  const expectedIds = decision.cards.map((card) => String(card.instanceId));
  const topIds = action.response.topIds;
  const bottomIds = action.response.bottomIds;
  const placedOnTop = topIds.length === expectedIds.length;
  const placedOnBottom = bottomIds.length === expectedIds.length;
  if (!placedOnTop && !placedOnBottom) {
    return fail("Selected cards must all be placed on top or all on bottom.");
  }
  const responseIds = [...topIds, ...bottomIds];
  if (
    hasDuplicateIds(responseIds) ||
    responseIds.length !== expectedIds.length ||
    !responseIds.every((id) => expectedIds.includes(id))
  ) {
    return fail("Top and bottom ids must partition the selected cards.");
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return fail("Selected hand placement player is missing.");
  }
  const selectedIds = new Set(expectedIds);
  const selectedCards: CardInstance[] = [];
  for (const cardRef of decision.cards) {
    const current = player.hand.find(
      (card) =>
        card.instanceId === cardRef.instanceId &&
        card.cardId === cardRef.cardId,
    );
    if (current === undefined) {
      return fail("Selected hand placement decision is stale.");
    }
    selectedCards.push(current);
  }
  const orderedCards = orderedCardsFromIds(
    selectedCards,
    placedOnTop ? topIds : bottomIds,
  );
  const nextHand = reindexZoneCards(
    player.hand.filter((card) => !selectedIds.has(String(card.instanceId))),
    "hand",
    decision.playerId,
    "hand",
  );
  const position = placedOnTop ? "top" : "bottom";
  const nextDeck = reindexZoneCards(
    position === "top"
      ? [...orderedCards, ...player.deck]
      : [...player.deck, ...orderedCards],
    "deck",
    decision.playerId,
    "deck",
  );
  const eventBaseState: GameState = {
    ...state,
    players: {
      ...state.players,
      [decision.playerId]: {
        ...player,
        deck: nextDeck,
        hand: nextHand,
      },
    },
  };
  const events: EngineEvent[] = [];
  appendEvent(
    eventBaseState,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: action.response.type,
      orderedCount: responseIds.length,
    },
    decision.visibility,
  );
  for (const card of orderedCards) {
    const moved = nextDeck.find(
      (candidate) => candidate.instanceId === card.instanceId,
    );
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      {
        from: { zone: "hand", playerId: decision.playerId, slot: "hand" },
        to: {
          zone: "deck",
          playerId: decision.playerId,
          slot: "deck",
          position,
        },
        reason: "effect",
      },
      { type: "public" },
    );
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      {
        instanceId: card.instanceId,
        cardId: card.cardId,
        from: card.zone,
        to: moved?.zone,
        reason: "effect",
      },
      { type: "private", playerId: decision.playerId },
    );
  }
  for (const event of events) {
    event.causedBy = { type: "decision", decisionId: decision.id };
  }
  const nextState: GameState = {
    ...eventBaseState,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return { events, ok: true, state: nextState };
};
