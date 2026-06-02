import type {
  Action,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  appendEffectResolvedEvent,
  appendEvent,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import {
  addCardsToHand,
  cardMatchesSearchFilter,
  reindexZoneCards,
  zonesEqual,
} from "./action-state.js";
import {
  createSearchRevealOrderCardsDecision,
  hasSupportedDeckBottomRemainingCardsPolicy,
  hasSupportedTrashRemainingCardsPolicy,
  moveSearchRevealRemainderToTrash,
  toCardRefForPlayer,
  toDeckCard,
} from "./effect-runtime-search-reveal-remainder.js";
import {
  cardRefMatches,
  getQueuedEntryForSearchDecision,
  getRespondingPlayerId,
  hasDuplicateCardRefs,
  hasMalformedRespondToDecisionPlayerId,
  invalidDecision,
  isCardRef,
  isExpectedSearchRevealDecisionEnvelope,
  queueEntryIdFromSearchRevealSetId,
  revealIdForSetId,
  toHandCard,
} from "./effect-runtime-search-reveal-decision-helpers.js";

export const applySupportedSearchRevealChoiceResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: { deferQueueResolution?: boolean } = {},
): EngineResult => {
  const fail = (reason: string): EngineResult =>
    toEngineResult(state, [], invalidDecision(reason));

  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "selectCards") {
    return fail("No active search reveal selectCards decision.");
  }
  if (decision.id !== action.decisionId) {
    return fail("Decision id does not match current search reveal decision.");
  }
  if (hasMalformedRespondToDecisionPlayerId(action)) {
    return fail("Player does not match current search reveal decision.");
  }
  const respondingPlayerId = getRespondingPlayerId(action, decision.playerId);
  if (respondingPlayerId !== decision.playerId) {
    return fail("Player does not match current search reveal decision.");
  }
  if (action.response.type !== "cards") {
    return fail("Response type must be cards for search reveal choices.");
  }

  const responseCards = (action.response as { cards?: unknown }).cards;
  if (!Array.isArray(responseCards) || !responseCards.every(isCardRef)) {
    return fail("Response cards must be CardRef values.");
  }
  if (hasDuplicateCardRefs(responseCards)) {
    return fail("Selected cards must not contain duplicates.");
  }
  if (responseCards.length > 1) {
    return fail("Search reveal choices support at most one selected card.");
  }
  if (!isExpectedSearchRevealDecisionEnvelope(decision)) {
    return fail("Search reveal decision envelope is stale or unsupported.");
  }

  const revealId = revealIdForSetId(String(decision.request.set));
  const reveal =
    revealId === undefined
      ? undefined
      : state.revealedCards.find((record) => record.id === revealId);
  if (
    reveal === undefined ||
    reveal.origin !== "topOfDeck" ||
    reveal.cleanupPolicy !== "returnToOrigin" ||
    reveal.visibility.type !== "private" ||
    reveal.visibility.playerId !== decision.playerId ||
    reveal.cards.length < decision.candidates.length ||
    !decision.candidates.every((candidate) =>
      reveal.cards.some((card) => cardRefMatches(candidate.card, card)),
    )
  ) {
    return fail("Search reveal record is stale or unsupported.");
  }

  const selectedCard = responseCards[0];
  if (
    selectedCard !== undefined &&
    (!decision.candidates.some((candidate) =>
      cardRefMatches(selectedCard, candidate.card),
    ) ||
      !cardMatchesSearchFilter(
        state.cardManifest.cards[selectedCard.cardId],
        decision.request.filter ?? {},
      ))
  ) {
    return fail("Selected card must be an active search candidate.");
  }

  const player = state.players[decision.playerId];
  if (player === undefined) {
    return fail("Search reveal player is missing.");
  }
  const lookedDeckCards = player.deck.slice(0, reveal.cards.length);
  if (
    lookedDeckCards.length !== reveal.cards.length ||
    !reveal.cards.every((card, index) => {
      const deckCard = lookedDeckCards[index];
      return (
        deckCard !== undefined &&
        card.instanceId === deckCard.instanceId &&
        card.cardId === deckCard.cardId &&
        card.playerId === decision.playerId &&
        card.zone !== undefined &&
        zonesEqual(card.zone, deckCard.zone)
      );
    })
  ) {
    return fail("Search reveal looked cards are stale or unsupported.");
  }

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
      selectedCount: responseCards.length,
    },
    decision.visibility,
  );
  const decisionResolved = events[0];
  if (decisionResolved !== undefined) {
    decisionResolved.causedBy = { type: "decision", decisionId: decision.id };
  }

  const selectedDeckCard =
    selectedCard === undefined
      ? undefined
      : lookedDeckCards.find(
          (card) => card.instanceId === selectedCard.instanceId,
        );
  const movedCard =
    selectedCard === undefined
      ? undefined
      : selectedDeckCard === undefined
        ? undefined
        : toHandCard(selectedDeckCard, decision.playerId, player.hand.length);
  if (selectedCard !== undefined && movedCard === undefined) {
    return fail("Selected card is no longer in the looked deck cards.");
  }
  if (movedCard !== undefined && selectedDeckCard !== undefined) {
    if (decision.visibility.type !== "private") {
      return fail("Search reveal decision visibility is unsupported.");
    }
    if (reveal.visibility.playerId !== decision.playerId) {
      return fail("Search reveal record visibility is unsupported.");
    }
    const selectedRevealVisibility =
      state.revealedCards.find((record) => record.id === reveal.id)
        ?.visibility ?? decision.visibility;
    if (selectedRevealVisibility.type !== "private") {
      return fail("Search reveal record visibility is unsupported.");
    }
    if (
      decision.request.visibility !== "privateToChooser" &&
      decision.request.visibility !== "public"
    ) {
      return fail("Search reveal request visibility is unsupported.");
    }
    appendEvent(
      state,
      events,
      "cardMoved",
      {
        instanceId: selectedDeckCard.instanceId,
        cardId: selectedDeckCard.cardId,
        from: selectedDeckCard.zone,
        to: movedCard.zone,
        reason: "searchRevealChoice",
        selectionSetId: decision.request.set,
      },
      decision.visibility,
    );
    const cardMoved = events[events.length - 1];
    if (cardMoved !== undefined) {
      cardMoved.causedBy = { type: "decision", decisionId: decision.id };
    }
  }

  const queueEntryId = queueEntryIdFromSearchRevealSetId(
    String(decision.request.set),
  );
  const queuedEntry = getQueuedEntryForSearchDecision(state, decision.causedBy);
  const selectedInstanceId = selectedCard?.instanceId;
  const remainingOriginalLookedCards = lookedDeckCards.filter(
    (card) => card.instanceId !== selectedInstanceId,
  );
  const remainingLookedCards = remainingOriginalLookedCards.map((card, index) =>
    toDeckCard(card, decision.playerId, index),
  );
  const tail = player.deck.slice(reveal.cards.length);
  const deckWhileOrdering = reindexZoneCards(
    [...remainingLookedCards, ...tail],
    "deck",
    decision.playerId,
    "deck",
  );
  const remainderRefs = deckWhileOrdering
    .slice(0, remainingLookedCards.length)
    .map((card) => toCardRefForPlayer(card, decision.playerId));
  const publicSelectedReveal =
    selectedCard !== undefined && decision.request.visibility === "public";
  if (
    movedCard !== undefined &&
    publicSelectedReveal &&
    selectedDeckCard !== undefined
  ) {
    appendEvent(
      state,
      events,
      "cardRevealed",
      {
        revealId: `reveal:search-reveal:selected:${queueEntryId ?? decision.id}`,
        cards: [toCardRefForPlayer(selectedDeckCard, decision.playerId)],
        origin: "topOfDeck",
      },
      { type: "public" },
    );
    const selectedReveal = events[events.length - 1];
    if (selectedReveal !== undefined) {
      selectedReveal.causedBy = { type: "decision", decisionId: decision.id };
    }
  }

  if (
    hasSupportedDeckBottomRemainingCardsPolicy(decision.request) &&
    remainderRefs.length > 1 &&
    queueEntryId !== undefined
  ) {
    const orderDecision = createSearchRevealOrderCardsDecision(
      queueEntryId,
      decision.causedBy.type === "effect"
        ? decision.causedBy.effectId
        : (String(decision.id) as EffectQueueEntry["effectBlockId"]),
      decision.playerId,
      remainderRefs,
    );
    appendEvent(
      state,
      events,
      "decisionCreated",
      {
        decisionId: orderDecision.id,
        decisionType: orderDecision.type,
        playerId: orderDecision.playerId,
      },
      decision.visibility,
    );
    const orderCreated = events[events.length - 1];
    if (orderCreated !== undefined) {
      orderCreated.causedBy = { type: "decision", decisionId: decision.id };
    }
    const nextState: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      actionSeq: state.actionSeq + 1,
      players: {
        ...state.players,
        [decision.playerId]: {
          ...player,
          deck: deckWhileOrdering,
          hand:
            movedCard === undefined
              ? player.hand
              : addCardsToHand(player.hand, [movedCard], decision.playerId),
        },
      },
      pendingDecision: orderDecision,
      revealedCards: [
        ...state.revealedCards.filter((record) => record.id !== reveal.id),
        {
          ...reveal,
          cards: remainderRefs,
          createdAtStateSeq: toStateSeq(state.seq + 1),
        },
      ],
      eventJournal: [...state.eventJournal, ...events],
    };
    return toEngineResult(nextState, events);
  }

  const shouldTrashRemainder = hasSupportedTrashRemainingCardsPolicy(
    decision.request,
  );
  const finalDeck = reindexZoneCards(
    shouldTrashRemainder ? tail : [...tail, ...remainingLookedCards],
    "deck",
    decision.playerId,
    "deck",
  );
  const deckBeforeRemainderTrash = shouldTrashRemainder
    ? deckWhileOrdering
    : finalDeck;
  const stateBeforeRemainderTrash: GameState = {
    ...state,
    players: {
      ...state.players,
      [decision.playerId]: {
        ...player,
        deck: deckBeforeRemainderTrash,
        hand:
          movedCard === undefined
            ? player.hand
            : addCardsToHand(player.hand, [movedCard], decision.playerId),
      },
    },
  };
  const remainderTrashResult = shouldTrashRemainder
    ? moveSearchRevealRemainderToTrash(stateBeforeRemainderTrash, events, {
        cards: remainingOriginalLookedCards,
        causedBy: { type: "decision", decisionId: decision.id },
        playerId: decision.playerId,
        selectionSetId: String(decision.request.set),
      })
    : { state: stateBeforeRemainderTrash };
  if (queuedEntry !== undefined && options.deferQueueResolution !== true) {
    appendEffectResolvedEvent(state, events, queuedEntry);
  }

  const nextState: GameState = {
    ...remainderTrashResult.state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    effectQueue:
      queuedEntry === undefined || options.deferQueueResolution === true
        ? state.effectQueue
        : state.effectQueue.filter((entry) => entry.id !== queuedEntry.id),
    revealedCards: state.revealedCards.filter(
      (record) => record.id !== reveal.id,
    ),
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;

  return toEngineResult(nextState, events);
};
