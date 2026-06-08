import type {
  Action,
  CardInstance,
  Effect,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  OrderCardsDecision,
  SequenceSegmentResult,
} from "@optcg/types";

import {
  appendEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { reindexZoneCards, zonesEqual } from "../actions/state.js";

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

const hasDuplicateIds = (ids: readonly string[]): boolean =>
  ids.some((id, index) => ids.slice(index + 1).includes(id));

const isPlaceSetRemainderOrderDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is OrderCardsDecision =>
  decision.type === "orderCards" &&
  String(decision.id).startsWith(placeSetRemainderOrderPrefix);

const expectedIdsForDecision = (decision: OrderCardsDecision): string[] =>
  decision.cards.map((card) => String(card.instanceId));

const exactSameIds = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length && left.every((id) => right.includes(id));

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

const placeRemainderOnDeck = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
  orderedCards: readonly CardInstance[],
  position: "top" | "bottom",
): GameState | null => {
  const player = state.players[playerId];
  if (player === undefined) {
    return null;
  }
  const orderedIds = new Set(
    orderedCards.map((card) => String(card.instanceId)),
  );
  const remainingDeck = player.deck.filter(
    (card) => !orderedIds.has(String(card.instanceId)),
  );
  const nextDeck = reindexZoneCards(
    position === "top"
      ? [...orderedCards, ...remainingDeck]
      : [...remainingDeck, ...orderedCards],
    "deck",
    playerId,
    "deck",
  );
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, deck: nextDeck },
    },
  };
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
    effect.destination !== "deck" ||
    (effect.position !== "bottom" && effect.position !== "top") ||
    (effect.order !== "chooser" && effect.order !== "original")
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
    const moved = placeRemainderOnDeck(
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
  const decision: OrderCardsDecision = {
    id: toDecisionId(
      `${placeSetRemainderOrderPrefix}${String(params.entry.id)}:${String(params.index)}`,
    ),
    type: "orderCards",
    playerId: params.entry.controllerId,
    prompt: "Order the remaining looked cards.",
    causedBy: {
      type: "effect",
      queueEntryId: params.entry.id,
      effectId: params.entry.effectBlockId,
    },
    visibility: { type: "private", playerId: params.entry.controllerId },
    cards: current.remainder.map((card) => ({
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: params.entry.controllerId,
      zone: card.zone,
    })),
    destination: "deck",
    defaultResponse: {
      type: "orderedIds",
      ids: current.remainder.map((card) => String(card.instanceId)),
    },
  };
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
  const expectedIds = expectedIdsForDecision(decision);
  if (
    !Array.isArray(responseIds) ||
    !responseIds.every((id) => typeof id === "string") ||
    hasDuplicateIds(responseIds) ||
    !exactSameIds(responseIds, expectedIds)
  ) {
    return fail("Ordered ids must match the remaining set cards.");
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return fail("Set remainder order player is missing.");
  }
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
    return fail("Set remainder order cards are stale or unsupported.");
  }
  const orderedCards = responseIds.flatMap((id) => {
    const card = activeDeckCards.find(
      (candidate) => String(candidate.instanceId) === id,
    );
    return card === undefined ? [] : [card];
  });
  const moved = placeRemainderOnDeck(
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
      orderedCount: responseIds.length,
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
