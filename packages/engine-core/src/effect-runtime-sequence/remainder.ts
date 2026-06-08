import type {
  Action,
  Effect,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  OrderCardsDecision,
  SequenceSegmentResult,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "../action-results.js";
import {
  activeDeckCardsForOrder,
  createRemainingCardsOrderDecision,
  orderedDeckCardsFromIds,
  orderedIdsFromResponse,
  placeOrderedCardsOnDeck,
} from "../effect-runtime-card-set/remainder-order.js";
import { moveConcreteCardsToTrash } from "../movement/concrete-card-movement.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type PlaceSetRemainderEffect = Extract<Effect, { type: "placeSetRemainder" }>;
type SequenceSegment = SequenceEffect["effects"][number];
type SegmentLedgers = {
  savedReferences: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["savedReferences"];
  segmentResults: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["segmentResults"];
};

const placeSetRemainderOrderPrefix =
  "decision:orderCards:sequence-set-remainder:";

const isPlaceSetRemainderOrderDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is OrderCardsDecision =>
  decision.type === "orderCards" &&
  String(decision.id).startsWith(placeSetRemainderOrderPrefix);

const currentRemainderDeckCards = (
  state: GameState,
  effect: PlaceSetRemainderEffect,
  playerId: EffectQueueEntry["controllerId"],
) => {
  const player = state.players[playerId];
  const reveal = state.revealedCards.find(
    (record) => record.selectionSetId === String(effect.set),
  );
  if (
    player === undefined ||
    reveal === undefined ||
    reveal.origin !== "topOfDeck" ||
    reveal.cleanupPolicy !== "returnToOrigin"
  ) {
    return null;
  }
  const revealedIds = new Set(reveal.cards.map((card) => card.instanceId));
  const remainder = player.deck.filter((card) =>
    revealedIds.has(card.instanceId),
  );
  const deckPrefix = player.deck.slice(0, remainder.length);
  if (
    remainder.length === 0 ||
    !remainder.every((card, index) => {
      const prefixCard = deckPrefix[index];
      return (
        prefixCard !== undefined &&
        card.instanceId === prefixCard.instanceId &&
        card.cardId === prefixCard.cardId
      );
    })
  ) {
    return remainder.length === 0 ? { player, remainder, reveal } : null;
  }
  return { player, remainder, reveal };
};

export const applyPlaceSetRemainderSequenceSegment = (params: {
  effect: PlaceSetRemainderEffect;
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceSegment;
  segmentKey: (segment: SequenceSegment, index: number) => string;
  state: GameState;
}):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      paused?: false;
      state: GameState;
    }
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      paused: true;
      state: GameState;
    }
  | { ok: false } => {
  const effect = params.effect;
  if (
    effect.owner !== "self" ||
    !(
      (effect.destination === "deck" &&
        (effect.position === "bottom" || effect.position === "top") &&
        (effect.order === "chooser" || effect.order === "original")) ||
      (effect.destination === "trash" &&
        effect.position === "bottom" &&
        effect.order === "original")
    )
  ) {
    return { ok: false };
  }
  const current = currentRemainderDeckCards(
    params.state,
    effect,
    params.entry.controllerId,
  );
  if (current === null) {
    return { ok: false };
  }
  const resultKey = params.segmentKey(params.segment, params.index);
  const completedLedgers = (changedState: boolean): SegmentLedgers => ({
    ...params.ledgers,
    segmentResults: {
      ...params.ledgers.segmentResults,
      [resultKey]: {
        ...params.emptySegmentResult(),
        attempted: true,
        succeeded: true,
        changedState,
        selectedCards: current.remainder.map((card) => ({
          instanceId: card.instanceId,
          cardId: card.cardId,
          playerId: params.entry.controllerId,
          zone: card.zone,
        })),
      },
    },
  });
  if (effect.destination === "trash") {
    const events: EngineEvent[] = [];
    const moved = moveConcreteCardsToTrash(
      params.state,
      events,
      current.remainder,
      {
        cardMovedPayloadExtra: { selectionSetId: String(effect.set) },
        cardMovedPayloadShape: "zoneRefs",
        cardMovedVisibility: { type: "public" },
        cardTrashedVisibility: { type: "public" },
        causedBy: {
          type: "effect",
          queueEntryId: params.entry.id,
          effectId: params.entry.effectBlockId,
        },
        emitCardTrashed: true,
        includeCardIdentityInCardMoved: true,
        playerId: params.entry.controllerId,
        reason: "searchRevealRemainder",
        sourceZone: "deck",
      },
    );
    return {
      events,
      ledgers: completedLedgers(current.remainder.length > 0),
      ok: true,
      state: {
        ...moved.state,
        revealedCards: moved.state.revealedCards.filter(
          (record) => record.id !== current.reveal.id,
        ),
        eventJournal: [...params.state.eventJournal, ...events],
      },
    };
  }
  if (current.remainder.length === 0) {
    return {
      events: [],
      ledgers: completedLedgers(false),
      ok: true,
      state: {
        ...params.state,
        revealedCards: params.state.revealedCards.filter(
          (record) => record.id !== current.reveal.id,
        ),
      },
    };
  }
  if (effect.order === "original" || current.remainder.length === 1) {
    const moved = placeOrderedCardsOnDeck(
      params.state,
      params.entry.controllerId,
      current.remainder,
      effect.position,
    );
    if (moved === null) {
      return { ok: false };
    }
    return {
      events: [],
      ledgers: completedLedgers(current.remainder.length > 0),
      ok: true,
      state: {
        ...moved,
        revealedCards: moved.revealedCards.filter(
          (record) => record.id !== current.reveal.id,
        ),
      },
    };
  }
  const decision = createRemainingCardsOrderDecision({
    cards: current.remainder.map((card) => ({
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: params.entry.controllerId,
      zone: card.zone,
    })),
    decisionId: `${placeSetRemainderOrderPrefix}${String(params.entry.id)}:${String(params.index)}`,
    effectId: params.entry.effectBlockId,
    playerId: params.entry.controllerId,
    queueEntryId: params.entry.id,
  });
  const events: EngineEvent[] = [];
  appendEvent(
    params.state,
    events,
    "decisionCreated",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
    },
    decision.visibility,
  );
  const event = events[0];
  if (event !== undefined) {
    event.causedBy = decision.causedBy;
  }
  return {
    events,
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [resultKey]: {
          ...params.emptySegmentResult(),
          attempted: true,
          selectedCards: decision.cards,
        },
      },
    },
    ok: true,
    paused: true,
    state: {
      ...params.state,
      seq: toStateSeq(params.state.seq + 1),
      pendingDecision: decision,
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

export const applyPlaceSetRemainderOrderResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || !isPlaceSetRemainderOrderDecision(decision)) {
    return null;
  }
  const fail = (reason: string): EngineResult =>
    toEngineResult(state, [], invalidDecision(reason));
  if (action.response.type !== "orderedIds") {
    return fail("Response type must be orderedIds for set remainder order.");
  }
  const responseIds = (action.response as { ids?: unknown }).ids;
  const expectedIds = decision.cards.map((card) => String(card.instanceId));
  const orderedIds = orderedIdsFromResponse(responseIds, expectedIds);
  if (orderedIds === null) {
    return fail("Ordered ids must match the remaining set cards.");
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return fail("Set remainder order player is missing.");
  }
  const activeDeckCards = activeDeckCardsForOrder(
    state,
    decision.playerId,
    decision.cards,
  );
  if (activeDeckCards === null) {
    return fail("Set remainder order cards are stale or unsupported.");
  }
  const orderedCards = orderedDeckCardsFromIds(activeDeckCards, orderedIds);
  const moved = placeOrderedCardsOnDeck(
    state,
    decision.playerId,
    orderedCards,
    "bottom",
  );
  if (moved === null) {
    return fail("Set remainder order player is missing.");
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
      orderedCount: orderedIds.length,
    },
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }
  const orderedIdSet = new Set(expectedIds);
  const revealToClear = moved.revealedCards.find((record) =>
    expectedIds.every((id) =>
      record.cards.some((card) => String(card.instanceId) === id),
    ),
  );
  const nextState: GameState = {
    ...moved,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    revealedCards:
      revealToClear === undefined
        ? moved.revealedCards
        : moved.revealedCards.filter(
            (record) =>
              record.id !== revealToClear.id ||
              !record.cards.some((card) =>
                orderedIdSet.has(String(card.instanceId)),
              ),
          ),
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return toEngineResult(nextState, events);
};
