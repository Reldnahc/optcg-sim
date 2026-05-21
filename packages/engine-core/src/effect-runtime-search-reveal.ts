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
  OrderCardsDecision,
  SelectCardsDecision,
} from "@optcg/types";

import {
  appendEffectResolvedEvent,
  appendEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import {
  cardMatchesSearchFilter,
  isSupportedSearchCardFilter,
  reindexZoneCards,
  zonesEqual,
} from "./action-state.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { resolvePlayerId } from "./effect-runtime-primitives.js";

type SearchEffect = Extract<Effect, { type: "search" }>;
type EngineInternalTransientCardSet = {
  id: string;
  cards: CardRef[];
  origin: string;
  ownerId?: CardInstance["owner"];
  controllerId?: CardInstance["controller"];
  visibility: { type: string; playerId: EffectQueueEntry["controllerId"] };
  cleanupPolicy: string;
};

export type SearchRevealTransientSetResult =
  | {
      events: EngineEvent[];
      kind: "created";
      ok: true;
      state: GameState;
      transientSet: EngineInternalTransientCardSet;
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
      transientSet: EngineInternalTransientCardSet;
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

const hasSupportedRemainingCardsPolicy = (
  request: SearchEffect["request"],
): boolean =>
  request.remainingCards !== undefined &&
  request.remainingCards.destination === "deck" &&
  request.remainingCards.position === "bottom" &&
  request.remainingCards.order === "ownerChoice";

const isLegacyTopOneSearch = (effect: SearchEffect): boolean =>
  effect.request.lookCount === 1 &&
  effect.request.remainingCards === undefined &&
  isExactCharacterCategoryFilter(effect.request.filter);

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
  if (
    typeof request.lookCount !== "number" ||
    !Number.isSafeInteger(request.lookCount) ||
    request.lookCount < 1
  ) {
    return { ok: false, reason: "unsupported-look-count" };
  }
  if (!isSupportedSearchCardFilter(request.filter)) {
    return { ok: false, reason: "unsupported-filter" };
  }
  if (request.min !== 0 || request.max !== 1) {
    return { ok: false, reason: "unsupported-selection-cardinality" };
  }
  if (request.destination !== "hand") {
    return { ok: false, reason: "unsupported-destination" };
  }
  if (
    request.revealTo !== "chooserOnly" &&
    request.revealTo !== "bothPlayers"
  ) {
    return { ok: false, reason: "unsupported-visibility" };
  }
  if (request.lookCount === 1 && request.revealTo !== "chooserOnly") {
    return { ok: false, reason: "unsupported-visibility" };
  }
  if (request.shuffleAfter !== false) {
    return { ok: false, reason: "unsupported-shuffle" };
  }
  if (
    request.lookCount === 1 &&
    request.remainingCards === undefined &&
    !isLegacyTopOneSearch(effect)
  ) {
    return { ok: false, reason: "unsupported-remaining-cards-policy" };
  }
  if (request.lookCount === 1 && request.remainingCards !== undefined) {
    return { ok: false, reason: "unsupported-remaining-cards-policy" };
  }
  if (request.lookCount > 1 && !hasSupportedRemainingCardsPolicy(request)) {
    return { ok: false, reason: "unsupported-remaining-cards-policy" };
  }
  if (
    request.remainingCards !== undefined &&
    !hasSupportedRemainingCardsPolicy(request)
  ) {
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
  if (player === undefined || player.deck.length === 0) {
    return {
      events: [],
      kind: "noEligibleCandidate",
      ok: true,
      state,
    };
  }

  const lookedCards = player.deck.slice(0, effect.request.lookCount);
  const eligibleCards = lookedCards.filter((card) =>
    cardMatchesSearchFilter(
      state.cardManifest.cards[card.cardId],
      effect.request.filter,
    ),
  );
  if (
    eligibleCards.length === 0 &&
    (isLegacyTopOneSearch(effect) || lookedCards.length === 0)
  ) {
    return {
      events: [],
      kind: "noEligibleCandidate",
      ok: true,
      state,
    };
  }

  const transientSet: EngineInternalTransientCardSet = {
    id: `set:search-reveal:${String(entry.id)}`,
    cards: lookedCards.map((card) => ({
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: supported.playerId,
      zone: card.zone,
    })),
    origin: "topOfDeck",
    ownerId: supported.playerId,
    controllerId: supported.playerId,
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

const orderDecisionIdForQueueEntryId = (queueEntryId: string) =>
  toDecisionId(`decision:orderCards:search-reveal:${queueEntryId}`);

const transientSetIdForEntry = (entry: EffectQueueEntry) =>
  `set:search-reveal:${String(entry.id)}`;

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];
const hasMalformedRespondToDecisionPlayerId = (
  action: Extract<Action, { type: "respondToDecision" }>,
): boolean =>
  "playerId" in action &&
  typeof (action as { playerId?: unknown }).playerId !== "string";
const getRespondingPlayerId = (
  action: Extract<Action, { type: "respondToDecision" }>,
  decisionPlayerId: SelectCardsDecision["playerId"],
): SelectCardsDecision["playerId"] => {
  if (
    "playerId" in action &&
    typeof (action as { playerId?: unknown }).playerId === "string"
  ) {
    return (action as { playerId: SelectCardsDecision["playerId"] }).playerId;
  }
  return decisionPlayerId;
};

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

const queueEntryIdFromSearchRevealSetId = (
  setId: string,
): string | undefined => {
  const prefix = "set:search-reveal:";
  return setId.startsWith(prefix) ? setId.slice(prefix.length) : undefined;
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
  if (
    decision.id ===
      toDecisionId(`decision:selectCards:search-reveal:${queueEntryId}`) &&
    decision.request.min === 0 &&
    decision.request.max === 1 &&
    decision.request.allowFewerIfUnavailable &&
    decision.request.chooser === "self" &&
    decision.request.visibility === "privateToChooser" &&
    isSupportedSearchCardFilter(filter) &&
    decision.visibility.type === "private" &&
    decision.visibility.playerId === decision.playerId
  ) {
    return decision.candidates.every(
      (candidate) =>
        candidate.visibility.type === "private" &&
        candidate.visibility.playerId === decision.playerId,
    );
  }
  return false;
};

const toHandCard = (
  card: CardInstance,
  playerId: CardInstance["controller"],
  index: number,
): CardInstance => ({
  ...card,
  zone: { zone: "hand", playerId, slot: "hand", index },
});

const toDeckCard = (
  card: CardInstance,
  playerId: CardInstance["controller"],
  index: number,
): CardInstance => ({
  ...card,
  zone: { zone: "deck", playerId, slot: "deck", index },
});

const createSearchRevealOrderCardsDecision = (
  queueEntryId: string,
  effectId: EffectQueueEntry["effectBlockId"],
  playerId: EffectQueueEntry["controllerId"],
  cards: readonly CardRef[],
): OrderCardsDecision => ({
  id: orderDecisionIdForQueueEntryId(queueEntryId),
  type: "orderCards",
  playerId,
  prompt: "Order the remaining looked cards.",
  causedBy: {
    type: "effect",
    queueEntryId: queueEntryId as EffectQueueEntry["id"],
    effectId,
  },
  visibility: { type: "private", playerId },
  cards: cards.map((card) => ({ ...card })),
  destination: "deck",
  defaultResponse: {
    type: "orderedIds",
    ids: cards.map((card) => String(card.instanceId)),
  },
});

const toCardRefForPlayer = (
  card: CardInstance,
  playerId: CardInstance["controller"],
): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const getQueuedEntryForSearchDecision = (
  state: GameState,
  causedBy: NonNullable<GameState["pendingDecision"]>["causedBy"],
): EffectQueueEntry | undefined =>
  causedBy.type === "effect"
    ? state.effectQueue.find(
        (entry) =>
          entry.id === causedBy.queueEntryId &&
          entry.effectBlockId === causedBy.effectId,
      )
    : undefined;

const hasExpectedTransientSetShape = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
  entry: EffectQueueEntry,
  transientSet: EngineInternalTransientCardSet,
): boolean => {
  if (
    state.pendingDecision !== undefined ||
    transientSet.id !== transientSetIdForEntry(entry) ||
    transientSet.cards.length < 1 ||
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
  if (player === undefined) {
    return false;
  }
  const lookedDeckCards = player.deck.slice(0, transientSet.cards.length);
  return transientSet.cards.every((card, index) => {
    const deckCard = lookedDeckCards[index];
    return (
      deckCard !== undefined &&
      card.instanceId === deckCard.instanceId &&
      card.cardId === deckCard.cardId &&
      card.playerId === playerId &&
      card.zone !== undefined &&
      zonesEqual(card.zone, deckCard.zone)
    );
  });
};

export const createSupportedSearchRevealChoiceDecisionFromTransientSet = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SearchEffect,
  transientSet: EngineInternalTransientCardSet,
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
  const candidates = cards.filter((card) =>
    cardMatchesSearchFilter(
      state.cardManifest.cards[card.cardId],
      effect.request.filter,
    ),
  );

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

  if (candidates.length === 0) {
    const pendingDecision = createSearchRevealOrderCardsDecision(
      String(entry.id),
      entry.effectBlockId,
      supported.playerId,
      cards,
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
  }

  const pendingDecision: SelectCardsDecision = {
    id: decisionIdForEntry(entry),
    type: "selectCards",
    playerId: supported.playerId,
    prompt:
      effect.request.revealTo === "bothPlayers"
        ? "Choose a revealed card to reveal, or decline."
        : "Choose a revealed card or decline.",
    causedBy,
    visibility,
    request: {
      timing: "onResolution",
      chooser: "self",
      set: transientSet.id as NonNullable<
        SelectCardsDecision["request"]["set"]
      >,
      filter: effect.request.filter,
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "privateToChooser",
    },
    candidates: cards
      .map((card) => ({
        card,
        visibility,
      }))
      .filter((candidate) =>
        cardMatchesSearchFilter(
          state.cardManifest.cards[candidate.card.cardId],
          effect.request.filter,
        ),
      ),
    defaultResponse: { type: "cards", cards: [] },
  };
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
    if (decision.request.visibility !== "privateToChooser") {
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
  const remainingLookedCards = lookedDeckCards
    .filter((card) => card.instanceId !== selectedInstanceId)
    .map((card, index) => toDeckCard(card, decision.playerId, index));
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
    selectedCard !== undefined &&
    decision.prompt === "Choose a revealed card to reveal, or decline.";
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

  if (remainderRefs.length > 1 && queueEntryId !== undefined) {
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
            movedCard === undefined ? player.hand : [...player.hand, movedCard],
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

  const finalDeck = reindexZoneCards(
    [...tail, ...remainingLookedCards],
    "deck",
    decision.playerId,
    "deck",
  );
  if (queuedEntry !== undefined) {
    appendEffectResolvedEvent(state, events, queuedEntry);
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [decision.playerId]: {
        ...player,
        deck: finalDeck,
        hand:
          movedCard === undefined ? player.hand : [...player.hand, movedCard],
      },
    },
    effectQueue:
      queuedEntry === undefined
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
