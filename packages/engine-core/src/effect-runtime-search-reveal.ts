import type {
  Action,
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  SelectCardsDecision,
  TransientCardSet,
} from "@optcg/types";

import {
  appendEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { reindexZoneCards, zonesEqual } from "./action-state.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { resolvePlayerId } from "./effect-runtime-primitives.js";

type SearchEffect = Extract<Effect, { type: "search" }>;

export type SearchRevealTransientSetResult =
  | {
      events: EngineEvent[];
      kind: "created";
      ok: true;
      state: GameState;
      transientSet: TransientCardSet;
      transientSetHash: string;
    }
  | {
      events: EngineEvent[];
      kind: "noEligibleCandidate";
      ok: true;
      state: GameState;
    }
  | {
      error: EngineError;
      events: EngineEvent[];
      ok: false;
      state: GameState;
    };

export type SearchRevealChoiceDecisionResult =
  | {
      events: EngineEvent[];
      kind: "decisionCreated";
      ok: true;
      state: GameState;
      transientSet: TransientCardSet;
      transientSetHash: string;
    }
  | {
      events: EngineEvent[];
      kind: "noEligibleCandidate";
      ok: true;
      state: GameState;
    }
  | {
      error: EngineError;
      events: EngineEvent[];
      ok: false;
      state: GameState;
    };

type SearchRevealSupportGateFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-zone"
  | "unsupported-player-ref"
  | "unsupported-look-count"
  | "unsupported-filter"
  | "unsupported-selection-cardinality"
  | "unsupported-destination"
  | "unsupported-visibility"
  | "unsupported-shuffle"
  | "unsupported-remaining-cards-policy"
  | "unsupported-transient-set-state";

interface SearchRevealSupportGateErrorDetails {
  reason: SearchRevealSupportGateFailureReason;
}

const searchRevealSupportGateError = (
  effectId: EffectQueueEntry["effectBlockId"],
  reason: SearchRevealSupportGateFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SearchRevealSupportGateErrorDetails,
});

const failClosed = (
  state: GameState,
  entry: EffectQueueEntry,
  reason: SearchRevealSupportGateFailureReason,
): SearchRevealTransientSetResult => ({
  error: searchRevealSupportGateError(entry.effectBlockId, reason),
  events: [],
  ok: false,
  state,
});

const failChoiceClosed = (
  state: GameState,
  entry: EffectQueueEntry,
  reason: SearchRevealSupportGateFailureReason,
): SearchRevealChoiceDecisionResult => ({
  error: searchRevealSupportGateError(entry.effectBlockId, reason),
  events: [],
  ok: false,
  state,
});

const isExactCharacterCategoryFilter = (
  filter: SearchEffect["request"]["filter"],
): boolean => {
  const keys = Object.keys(filter).sort();
  return (
    keys.length === 1 &&
    keys[0] === "categories" &&
    filter.categories !== undefined &&
    filter.categories.length === 1 &&
    filter.categories[0] === "character"
  );
};

const validateSupportedSearchEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SearchEffect,
):
  | { ok: true; playerId: EffectQueueEntry["controllerId"] }
  | { ok: false; reason: SearchRevealSupportGateFailureReason } => {
  const request = effect.request;
  if (request.zone !== "deck") {
    return { ok: false, reason: "unsupported-zone" };
  }
  if (request.player !== "self") {
    return { ok: false, reason: "unsupported-player-ref" };
  }
  const playerId = resolvePlayerId(state, entry, request.player);
  if (playerId === undefined || playerId !== entry.controllerId) {
    return { ok: false, reason: "unsupported-player-ref" };
  }
  if (request.lookCount !== 1) {
    return { ok: false, reason: "unsupported-look-count" };
  }
  if (!isExactCharacterCategoryFilter(request.filter)) {
    return { ok: false, reason: "unsupported-filter" };
  }
  if (request.min !== 0 || request.max !== 1) {
    return { ok: false, reason: "unsupported-selection-cardinality" };
  }
  if (request.destination !== "hand") {
    return { ok: false, reason: "unsupported-destination" };
  }
  if (request.revealTo !== "chooserOnly") {
    return { ok: false, reason: "unsupported-visibility" };
  }
  if (request.shuffleAfter !== false) {
    return { ok: false, reason: "unsupported-shuffle" };
  }
  if (request.remainingCards !== undefined) {
    return { ok: false, reason: "unsupported-remaining-cards-policy" };
  }
  return { ok: true, playerId };
};

export const createSupportedSearchRevealTransientSet = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SearchEffect,
): SearchRevealTransientSetResult => {
  const supported = validateSupportedSearchEffect(state, entry, effect);
  if (!supported.ok) {
    return failClosed(state, entry, supported.reason);
  }

  const player = state.players[supported.playerId];
  const topDeck = player?.deck[0];
  if (player === undefined || topDeck === undefined) {
    return {
      events: [],
      kind: "noEligibleCandidate",
      ok: true,
      state,
    };
  }

  const resolved = state.cardManifest.cards[topDeck.cardId];
  if (resolved?.category !== "character") {
    return {
      events: [],
      kind: "noEligibleCandidate",
      ok: true,
      state,
    };
  }

  const transientSet: TransientCardSet = {
    id: `set:search-reveal:${String(entry.id)}` as TransientCardSet["id"],
    cards: [
      {
        instanceId: topDeck.instanceId,
        cardId: topDeck.cardId,
        playerId: supported.playerId,
        zone: topDeck.zone,
      },
    ],
    origin: "topOfDeck",
    ownerId: topDeck.owner,
    controllerId: topDeck.controller,
    visibility: { type: "private", playerId: supported.playerId },
    cleanupPolicy: "returnToOrigin",
  };

  return {
    events: [],
    kind: "created",
    ok: true,
    state,
    transientSet,
    transientSetHash: hashCanonicalStateValue(transientSet),
  };
};

const revealIdForEntry = (entry: EffectQueueEntry): string =>
  `reveal:search-reveal:${String(entry.id)}`;

const decisionIdForEntry = (entry: EffectQueueEntry) =>
  toDecisionId(`decision:selectCards:search-reveal:${String(entry.id)}`);

const transientSetIdForEntry = (entry: EffectQueueEntry) =>
  `set:search-reveal:${String(entry.id)}` as TransientCardSet["id"];

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const cardRefMatches = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  ((left.zone === undefined && right.zone === undefined) ||
    (left.zone !== undefined && zonesEqual(left.zone, right.zone)));

const isCardRef = (value: unknown): value is CardRef => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const zone = candidate["zone"];
  return (
    typeof candidate["instanceId"] === "string" &&
    typeof candidate["cardId"] === "string" &&
    typeof candidate["playerId"] === "string" &&
    (zone === undefined || (typeof zone === "object" && zone !== null))
  );
};

const hasDuplicateCardRefs = (cards: readonly CardRef[]): boolean =>
  cards.some((card, index) =>
    cards.slice(index + 1).some((candidate) => cardRefMatches(card, candidate)),
  );

const revealIdForSetId = (setId: string): string | undefined => {
  const prefix = "set:search-reveal:";
  if (!setId.startsWith(prefix)) {
    return undefined;
  }
  return `reveal:search-reveal:${setId.slice(prefix.length)}`;
};

const isExpectedSearchRevealDecisionEnvelope = (
  decision: SelectCardsDecision,
): boolean => {
  const setId = decision.request.set;
  const filter = decision.request.filter;
  if (
    setId === undefined ||
    filter === undefined ||
    !String(setId).startsWith("set:search-reveal:")
  ) {
    return false;
  }
  const queueEntryId = String(setId).slice("set:search-reveal:".length);
  return (
    decision.id ===
      toDecisionId(`decision:selectCards:search-reveal:${queueEntryId}`) &&
    decision.request.min === 0 &&
    decision.request.max === 1 &&
    decision.request.allowFewerIfUnavailable &&
    decision.request.chooser === "self" &&
    decision.request.visibility === "privateToChooser" &&
    isExactCharacterCategoryFilter(filter) &&
    decision.visibility.type === "private" &&
    decision.visibility.playerId === decision.playerId &&
    decision.candidates.length === 1
  );
};

const toHandCard = (
  card: CardInstance,
  playerId: CardInstance["controller"],
  index: number,
): CardInstance => ({
  ...card,
  zone: { zone: "hand", playerId, slot: "hand", index },
});

const hasExpectedTransientSetShape = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
  entry: EffectQueueEntry,
  transientSet: TransientCardSet,
): boolean => {
  if (
    state.pendingDecision !== undefined ||
    transientSet.id !== transientSetIdForEntry(entry) ||
    transientSet.cards.length !== 1 ||
    transientSet.origin !== "topOfDeck" ||
    transientSet.ownerId !== playerId ||
    transientSet.controllerId !== playerId ||
    transientSet.visibility.type !== "private" ||
    transientSet.visibility.playerId !== playerId ||
    transientSet.cleanupPolicy !== "returnToOrigin"
  ) {
    return false;
  }

  const player = state.players[playerId];
  const topDeck = player?.deck[0];
  const card = transientSet.cards[0];
  if (player === undefined || topDeck === undefined || card === undefined) {
    return false;
  }
  const resolved = state.cardManifest.cards[card.cardId];
  return (
    card.instanceId === topDeck.instanceId &&
    card.cardId === topDeck.cardId &&
    card.playerId === playerId &&
    card.zone !== undefined &&
    zonesEqual(card.zone, topDeck.zone) &&
    resolved?.category === "character"
  );
};

export const createSupportedSearchRevealChoiceDecisionFromTransientSet = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SearchEffect,
  transientSet: TransientCardSet,
): SearchRevealChoiceDecisionResult => {
  const supported = validateSupportedSearchEffect(state, entry, effect);
  if (!supported.ok) {
    return failChoiceClosed(state, entry, supported.reason);
  }
  if (
    !hasExpectedTransientSetShape(
      state,
      supported.playerId,
      entry,
      transientSet,
    )
  ) {
    return failChoiceClosed(state, entry, "unsupported-transient-set-state");
  }

  const causedBy = {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  } as const;
  const visibility = { type: "private", playerId: supported.playerId } as const;
  const cards = transientSet.cards.map((card) => ({ ...card }));
  const pendingDecision: SelectCardsDecision = {
    id: decisionIdForEntry(entry),
    type: "selectCards",
    playerId: supported.playerId,
    prompt: "Choose a revealed card or decline.",
    causedBy,
    visibility,
    request: {
      timing: "onResolution",
      chooser: "self",
      set: transientSet.id,
      filter: effect.request.filter,
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "privateToChooser",
    },
    candidates: cards.map((card) => ({
      card,
      visibility,
    })),
    defaultResponse: { type: "cards", cards: [] },
  };

  const events: EngineEvent[] = [];
  const revealId = revealIdForEntry(entry);
  appendEvent(
    state,
    events,
    "cardRevealed",
    {
      revealId,
      cards,
      origin: "topOfDeck",
      selectionSetId: transientSet.id,
    },
    visibility,
  );
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    visibility,
  );
  for (const event of events) {
    event.causedBy = causedBy;
  }

  const nextSeq = toStateSeq(state.seq + 1);
  const nextState: GameState = {
    ...state,
    seq: nextSeq,
    pendingDecision,
    revealedCards: [
      ...state.revealedCards,
      {
        id: revealId,
        cards,
        visibility,
        origin: "topOfDeck",
        createdAtStateSeq: nextSeq,
        cleanupPolicy: "returnToOrigin",
      },
    ],
    eventJournal: [...state.eventJournal, ...events],
  };

  return {
    events,
    kind: "decisionCreated",
    ok: true,
    state: nextState,
    transientSet,
    transientSetHash: hashCanonicalStateValue(transientSet),
  };
};

export const createSupportedSearchRevealChoiceDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SearchEffect,
): SearchRevealChoiceDecisionResult => {
  const transient = createSupportedSearchRevealTransientSet(
    state,
    entry,
    effect,
  );
  if (!transient.ok) {
    return transient;
  }
  if (transient.kind === "noEligibleCandidate") {
    return transient;
  }
  return createSupportedSearchRevealChoiceDecisionFromTransientSet(
    state,
    entry,
    effect,
    transient.transientSet,
  );
};

export const applySupportedSearchRevealChoiceResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
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
  if (action.playerId !== decision.playerId) {
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
  const candidate = decision.candidates[0]?.card;
  const revealCard = reveal?.cards[0];
  if (
    reveal === undefined ||
    reveal.origin !== "topOfDeck" ||
    reveal.cleanupPolicy !== "returnToOrigin" ||
    reveal.visibility.type !== "private" ||
    reveal.visibility.playerId !== decision.playerId ||
    reveal.cards.length !== 1 ||
    candidate === undefined ||
    revealCard === undefined ||
    !cardRefMatches(candidate, revealCard) ||
    state.cardManifest.cards[candidate.cardId]?.category !== "character"
  ) {
    return fail("Search reveal record is stale or unsupported.");
  }

  const selectedCard = responseCards[0];
  if (
    selectedCard !== undefined &&
    (!cardRefMatches(selectedCard, candidate) ||
      state.cardManifest.cards[selectedCard.cardId]?.category !== "character")
  ) {
    return fail("Selected card must be an active Character candidate.");
  }

  const player = state.players[decision.playerId];
  const topDeck = player?.deck[0];
  if (
    player === undefined ||
    topDeck === undefined ||
    candidate.zone === undefined ||
    topDeck.instanceId !== candidate.instanceId ||
    topDeck.cardId !== candidate.cardId ||
    topDeck.owner !== decision.playerId ||
    topDeck.controller !== decision.playerId ||
    !zonesEqual(candidate.zone, topDeck.zone)
  ) {
    return fail(
      "Search reveal candidate is no longer the active top deck card.",
    );
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

  const movedCard =
    selectedCard === undefined
      ? undefined
      : toHandCard(topDeck, decision.playerId, player.hand.length);
  if (movedCard !== undefined) {
    appendEvent(
      state,
      events,
      "cardMoved",
      {
        instanceId: topDeck.instanceId,
        cardId: topDeck.cardId,
        from: topDeck.zone,
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

  const nextPlayers =
    movedCard === undefined
      ? state.players
      : {
          ...state.players,
          [decision.playerId]: {
            ...player,
            deck: reindexZoneCards(
              player.deck.slice(1),
              "deck",
              decision.playerId,
              "deck",
            ),
            hand: [...player.hand, movedCard],
          },
        };

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: nextPlayers,
    revealedCards: state.revealedCards.filter(
      (record) => record.id !== reveal.id,
    ),
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;

  return toEngineResult(nextState, events);
};
