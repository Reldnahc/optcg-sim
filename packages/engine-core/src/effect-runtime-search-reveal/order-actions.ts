import type {
  Action,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  OrderCardsDecision,
  PlayerId,
} from "@optcg/types";

import {
  appendEffectResolvedEvent,
  appendEvent,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { reindexZoneCards, zonesEqual } from "../action-state.js";
import { hasSequenceFrameForDecision } from "../effect-runtime-sequence/frame-decisions.js";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const searchRevealOrderPrefix = "decision:orderCards:search-reveal:";

const isSearchRevealOrderCardsDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is OrderCardsDecision =>
  decision.type === "orderCards" &&
  String(decision.id).startsWith(searchRevealOrderPrefix);

const hasDuplicateIds = (ids: readonly string[]): boolean =>
  ids.some((id, index) => ids.slice(index + 1).includes(id));

export const getSearchRevealDecisionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision !== undefined &&
    isSearchRevealOrderCardsDecision(decision) &&
    decision.playerId === playerId
  ) {
    return [
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "orderedIds",
          ids: decision.cards.map((card) => String(card.instanceId)),
        },
      },
    ];
  }
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    decision.playerId !== playerId ||
    decision.request.set === undefined ||
    !String(decision.request.set).startsWith("set:search-reveal:")
  ) {
    return [];
  }

  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
    ...decision.candidates.map(
      (candidate): LegalAction => ({
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "cards", cards: [candidate.card] },
      }),
    ),
  ];
};

export const applySearchRevealOrderResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || !isSearchRevealOrderCardsDecision(decision)) {
    return null;
  }
  const fail = (reason: string): EngineResult =>
    toEngineResult(state, [], invalidDecision(reason));
  if (action.response.type !== "orderedIds") {
    return fail("Response type must be orderedIds for search reveal order.");
  }
  const responseIds = (action.response as { ids?: unknown }).ids;
  const expectedIds = decision.cards.map((card) => String(card.instanceId));
  if (
    !Array.isArray(responseIds) ||
    !responseIds.every((id) => typeof id === "string") ||
    hasDuplicateIds(responseIds) ||
    responseIds.length !== expectedIds.length ||
    !responseIds.every((id) => expectedIds.includes(id))
  ) {
    return fail("Ordered ids must match the remaining search cards.");
  }
  const player = state.players[decision.playerId];
  if (player === undefined)
    return fail("Search reveal order player is missing.");
  const activeDeckCards = player.deck.slice(0, decision.cards.length);
  if (
    activeDeckCards.length !== decision.cards.length ||
    !decision.cards.every((card, index) => {
      const deckCard = activeDeckCards[index];
      return (
        deckCard !== undefined &&
        card.instanceId === deckCard.instanceId &&
        card.cardId === deckCard.cardId &&
        card.zone !== undefined &&
        zonesEqual(card.zone, deckCard.zone)
      );
    })
  ) {
    return fail("Search reveal order cards are stale or unsupported.");
  }
  const orderedCards = responseIds.flatMap((id) => {
    const card = activeDeckCards.find(
      (candidate) => String(candidate.instanceId) === id,
    );
    return card === undefined ? [] : [card];
  });
  const causedBy = decision.causedBy;
  const queuedEntry =
    causedBy.type === "effect"
      ? state.effectQueue.find(
          (entry) =>
            entry.id === causedBy.queueEntryId &&
            entry.effectBlockId === causedBy.effectId,
        )
      : undefined;
  const events: EngineEvent[] = [];
  appendEvent(
    state,
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
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }
  const shouldResumeSequence = hasSequenceFrameForDecision(state, decision.id);
  if (queuedEntry !== undefined && !shouldResumeSequence) {
    appendEffectResolvedEvent(state, events, queuedEntry);
  }
  const finalDeck = reindexZoneCards(
    [...player.deck.slice(decision.cards.length), ...orderedCards],
    "deck",
    decision.playerId,
    "deck",
  );
  const queueEntryId = String(decision.id).slice(
    searchRevealOrderPrefix.length,
  );
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [decision.playerId]: { ...player, deck: finalDeck },
    },
    effectQueue:
      queuedEntry === undefined || shouldResumeSequence
        ? state.effectQueue
        : state.effectQueue.filter((entry) => entry.id !== queuedEntry.id),
    revealedCards: state.revealedCards.filter(
      (record) => record.id !== `reveal:search-reveal:${queueEntryId}`,
    ),
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return toEngineResult(nextState, events);
};
