import type {
  Action,
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  OrderCardsDecision,
  PlayerId,
} from "@optcg/types";

import {
  appendEffectResolvedEvent,
  appendEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { reorderDeckSlice, zonesEqual } from "./action-state.js";
import { resolvePlayerId } from "./effect-runtime-primitives.js";

type PlaceTopDeckCardsEffect = Extract<Effect, { type: "placeTopDeckCards" }>;

type PlacementFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-player-ref"
  | "invalid-placement-response"
  | "stale-placement-decision";

const decisionPrefix = "decision:orderCards:top-deck-placement:";

const placementError = (
  effectId: string,
  reason: PlacementFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason },
});

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const isPositiveSafeInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  Number.isInteger(value) &&
  value > 0;

export const isSupportedPlaceTopDeckCardsEffect = (
  effect: Effect,
): effect is PlaceTopDeckCardsEffect => {
  if (effect.type !== "placeTopDeckCards") {
    return false;
  }
  const candidate = effect as {
    readonly destination?: unknown;
    readonly order?: unknown;
  };
  return (
    effect.player === "self" &&
    isPositiveSafeInteger(effect.count) &&
    candidate.order === "ownerChoice" &&
    (candidate.destination === "top" || candidate.destination === "topOrBottom")
  );
};

export const isSupportedPlaceTopDeckCardsEffectBlock = (
  block: EffectDefinition["effects"][number],
): block is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: PlaceTopDeckCardsEffect;
} =>
  block.category === "auto" &&
  block.optional !== true &&
  block.cost === undefined &&
  block.conditionTiming === undefined &&
  block.failurePolicy === undefined &&
  block.sourcePresencePolicy !== undefined &&
  isSupportedPlaceTopDeckCardsEffect(block.effect);

export const resolveQueuedPlaceTopDeckCardsEffect = (
  effect: EffectDefinition["effects"][number] | undefined,
  entry: EffectQueueEntry,
): PlaceTopDeckCardsEffect | undefined =>
  effect !== undefined &&
  effect.sourcePresencePolicy === entry.sourcePresencePolicy &&
  isSupportedPlaceTopDeckCardsEffectBlock(effect)
    ? effect.effect
    : undefined;

export const createQueuedTopDeckPlacementDecision = (
  state: GameState,
  effect: EffectDefinition["effects"][number] | undefined,
  entry: EffectQueueEntry,
): EngineResult | undefined => {
  const topDeckPlacementEffect = resolveQueuedPlaceTopDeckCardsEffect(
    effect,
    entry,
  );
  return topDeckPlacementEffect === undefined
    ? undefined
    : createTopDeckPlacementDecision(state, entry, topDeckPlacementEffect);
};

const toCardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

export const createTopDeckPlacementDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
  options: { decisionIdSuffix?: string } = {},
): EngineResult => {
  if (!isSupportedPlaceTopDeckCardsEffect(effect)) {
    return toEngineResult(
      state,
      [],
      [placementError(entry.effectBlockId, "unsupported-effect-shape")],
    );
  }
  const playerId = resolvePlayerId(state, entry, effect.player);
  if (playerId === undefined || playerId !== entry.controllerId) {
    return toEngineResult(
      state,
      [],
      [placementError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      [placementError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }
  const cards = player.deck
    .slice(0, Math.min(effect.count, player.deck.length))
    .map((card) => toCardRef(card, playerId));
  if (cards.length === 0) {
    const events: EngineEvent[] = [];
    appendEffectResolvedEvent(state, events, entry);
    return toEngineResult(
      {
        ...state,
        seq: toStateSeq(state.seq + 1),
        effectQueue: state.effectQueue.filter(
          (queued) => queued.id !== entry.id,
        ),
        eventJournal: [...state.eventJournal, ...events],
      },
      events,
    );
  }

  const pendingDecision: OrderCardsDecision = {
    id: toDecisionId(
      `${decisionPrefix}${String(entry.id)}${
        options.decisionIdSuffix === undefined
          ? ""
          : `:${options.decisionIdSuffix}`
      }`,
    ),
    type: "orderCards",
    playerId,
    prompt: placementPrompt(effect.destination),
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    visibility: { type: "private", playerId },
    cards,
    destination: "deck",
    ...(effect.destination === "topOrBottom"
      ? { placement: { type: "topOrBottom" as const } }
      : {}),
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    pendingDecision.visibility,
  );
  const event = events[0];
  if (event !== undefined) {
    event.causedBy = pendingDecision.causedBy;
  }
  return toEngineResult(
    {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};

const isTopDeckPlacementOrderDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is OrderCardsDecision =>
  decision.type === "orderCards" &&
  String(decision.id).startsWith(decisionPrefix);

const placementPrompt = (
  destination: PlaceTopDeckCardsEffect["destination"],
): string => {
  if (destination === "top") {
    return "Place looked cards at the top of your deck.";
  }
  if (destination === "bottom") {
    return "Place looked cards at the bottom of your deck.";
  }
  return "Place looked cards at the top or bottom of your deck.";
};

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

export const applyTopDeckPlacementDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: { deferQueueResolution?: boolean } = {},
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || !isTopDeckPlacementOrderDecision(decision)) {
    return null;
  }
  const fail = (reason: string): EngineResult =>
    toEngineResult(state, [], invalidDecision(reason));
  const expectedIds = decision.cards.map((card) => String(card.instanceId));
  let topIds: string[];
  let bottomIds: string[];
  let responseType: string;
  if (decision.placement?.type === "topOrBottom") {
    if (action.response.type !== "topBottomPlacement") {
      return fail(
        "Response type must be topBottomPlacement for top-deck placement.",
      );
    }
    topIds = action.response.topIds;
    bottomIds = action.response.bottomIds;
    const placedOnTop = topIds.length === expectedIds.length;
    const placedOnBottom = bottomIds.length === expectedIds.length;
    if (!placedOnTop && !placedOnBottom) {
      return fail("Looked cards must all be placed on top or all on bottom.");
    }
    responseType = action.response.type;
  } else {
    if (action.response.type !== "orderedIds") {
      return fail("Response type must be orderedIds for top-deck placement.");
    }
    topIds = action.response.ids;
    bottomIds = [];
    responseType = action.response.type;
  }
  const responseIds = [...topIds, ...bottomIds];
  if (
    hasDuplicateIds(responseIds) ||
    responseIds.length !== expectedIds.length ||
    !responseIds.every((id) => expectedIds.includes(id))
  ) {
    return fail("Top and bottom ids must partition the looked cards.");
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      [placementError(String(decision.id), "unsupported-player-ref")],
    );
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
    return toEngineResult(
      state,
      [],
      [placementError(String(decision.id), "stale-placement-decision")],
    );
  }

  const topCards = orderedCardsFromIds(activeDeckCards, topIds);
  const bottomCards = orderedCardsFromIds(activeDeckCards, bottomIds);
  const finalDeck = reorderDeckSlice({
    deck: player.deck,
    destination: topCards.length > 0 ? "top" : "bottom",
    orderedSlice: topCards.length > 0 ? topCards : bottomCards,
    playerId: decision.playerId,
    sliceCount: decision.cards.length,
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
  const shouldResolveQueue =
    queuedEntry !== undefined && options.deferQueueResolution !== true;
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType,
      orderedCount: responseIds.length,
    },
    decision.visibility,
  );
  if (shouldResolveQueue) {
    appendEffectResolvedEvent(state, events, queuedEntry);
  }
  for (const event of events) {
    event.causedBy = { type: "decision", decisionId: decision.id };
  }
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [decision.playerId]: { ...player, deck: finalDeck },
    },
    effectQueue: !shouldResolveQueue
      ? state.effectQueue
      : state.effectQueue.filter((entry) => entry.id !== queuedEntry.id),
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return toEngineResult(nextState, events);
};
