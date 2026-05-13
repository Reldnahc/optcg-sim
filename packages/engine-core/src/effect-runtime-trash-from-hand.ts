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
  LegalAction,
  SelectCardsDecision,
} from "@optcg/types";

import {
  appendEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { reindexZoneCards, toCardRef, zonesEqual } from "./action-state.js";
import { resolvePlayerId } from "./effect-runtime-primitives.js";

type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;

type TrashFromHandFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-player-ref"
  | "unsupported-chooser-ref"
  | "unsupported-filter"
  | "invalid-count"
  | "insufficient-hand-cards";

interface TrashFromHandErrorDetails {
  reason: TrashFromHandFailureReason;
}

type TrashFromHandDecisionResult =
  | {
      events: EngineEvent[];
      ok: true;
      state: GameState;
    }
  | {
      error: EngineError;
      events: EngineEvent[];
      ok: false;
      state: GameState;
    };

export type TrashFromHandResponseApplication =
  | {
      allEvents: EngineEvent[];
      entry: EffectQueueEntry;
      eventBaseState: GameState;
      ok: true;
      resolutionEvents: readonly EngineEvent[];
      state: GameState;
    }
  | {
      result: EngineResult;
      ok: false;
    };

const decisionIdPrefix = "decision:selectCards:trash-from-hand:";

const trashFromHandError = (
  effectId: EffectQueueEntry["effectBlockId"],
  reason: TrashFromHandFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies TrashFromHandErrorDetails,
});

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const failClosed = (
  state: GameState,
  entry: EffectQueueEntry,
  reason: TrashFromHandFailureReason,
): TrashFromHandDecisionResult => ({
  error: trashFromHandError(entry.effectBlockId, reason),
  events: [],
  ok: false,
  state,
});

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

const cardRefMatches = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  ((left.zone === undefined && right.zone === undefined) ||
    (left.zone !== undefined &&
      right.zone !== undefined &&
      zonesEqual(left.zone, right.zone)));

const hasDuplicateInstanceIds = (cards: readonly CardRef[]): boolean =>
  new Set(cards.map((card) => card.instanceId)).size !== cards.length;

const decisionIdForEntry = (entry: EffectQueueEntry) =>
  toDecisionId(`${decisionIdPrefix}${String(entry.id)}`);

const validateSupportedTrashFromHandEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: TrashFromHandEffect,
):
  | { ok: true; playerId: EffectQueueEntry["controllerId"] }
  | { ok: false; reason: TrashFromHandFailureReason } => {
  if (effect.player !== "self") {
    return { ok: false, reason: "unsupported-player-ref" };
  }
  if (effect.chooser !== "self") {
    return { ok: false, reason: "unsupported-chooser-ref" };
  }
  if (effect.filter !== undefined) {
    return { ok: false, reason: "unsupported-filter" };
  }
  if (!Number.isInteger(effect.count) || effect.count <= 0) {
    return { ok: false, reason: "invalid-count" };
  }

  const playerId = resolvePlayerId(state, entry, effect.player);
  const chooserId = resolvePlayerId(state, entry, effect.chooser);
  if (playerId === undefined || playerId !== entry.controllerId) {
    return { ok: false, reason: "unsupported-player-ref" };
  }
  if (chooserId === undefined || chooserId !== playerId) {
    return { ok: false, reason: "unsupported-chooser-ref" };
  }
  const player = state.players[playerId];
  if (player === undefined || player.hand.length < effect.count) {
    return { ok: false, reason: "insufficient-hand-cards" };
  }
  return { ok: true, playerId };
};

export const isSupportedQueuedTrashFromHandEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: TrashFromHandEffect;
} =>
  effect.category === "auto" &&
  effect.optional !== true &&
  effect.oncePerTurn !== true &&
  effect.cost === undefined &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  effect.effect.type === "trashFromHand" &&
  effect.effect.player === "self" &&
  effect.effect.chooser === "self" &&
  effect.effect.filter === undefined &&
  Number.isInteger(effect.effect.count) &&
  effect.effect.count > 0;

export const createSupportedTrashFromHandChoiceDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: TrashFromHandEffect,
): TrashFromHandDecisionResult => {
  const supported = validateSupportedTrashFromHandEffect(state, entry, effect);
  if (!supported.ok) {
    return failClosed(state, entry, supported.reason);
  }
  const player = state.players[supported.playerId];
  if (player === undefined) {
    return failClosed(state, entry, "unsupported-player-ref");
  }

  const causedBy = {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  } as const;
  const visibility = { type: "private", playerId: supported.playerId } as const;
  const pendingDecision: SelectCardsDecision = {
    id: decisionIdForEntry(entry),
    type: "selectCards",
    playerId: supported.playerId,
    prompt: "Choose cards from hand to trash.",
    causedBy,
    visibility,
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "hand",
      min: effect.count,
      max: effect.count,
      allowFewerIfUnavailable: false,
      visibility: "privateToChooser",
    },
    candidates: player.hand.map((card) => ({
      card: toCardRef(card, supported.playerId),
      visibility,
    })),
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
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }

  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

const isTrashFromHandDecision = (decision: SelectCardsDecision): boolean =>
  String(decision.id).startsWith(decisionIdPrefix) &&
  decision.request.timing === "onResolution" &&
  decision.request.chooser === "self" &&
  decision.request.player === "self" &&
  decision.request.zone === "hand" &&
  decision.request.set === undefined &&
  decision.request.filter === undefined &&
  decision.request.min === decision.request.max &&
  decision.request.min > 0 &&
  !decision.request.allowFewerIfUnavailable &&
  decision.request.visibility === "privateToChooser" &&
  decision.visibility.type === "private" &&
  decision.visibility.playerId === decision.playerId;

export const isTrashFromHandSelectCardsDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is SelectCardsDecision =>
  decision.type === "selectCards" && isTrashFromHandDecision(decision);

const findCurrentHandCards = (
  state: GameState,
  decision: SelectCardsDecision,
  selected: readonly CardRef[],
): CardInstance[] | null => {
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return null;
  }
  const cards: CardInstance[] = [];
  for (const ref of selected) {
    const card = player.hand.find((candidate) =>
      cardRefMatches(ref, toCardRef(candidate, decision.playerId)),
    );
    if (card === undefined) {
      return null;
    }
    cards.push(card);
  }
  return cards;
};

const hasCurrentCandidateEnvelope = (
  state: GameState,
  decision: SelectCardsDecision,
): boolean => {
  const player = state.players[decision.playerId];
  if (
    player === undefined ||
    decision.candidates.length !== player.hand.length
  ) {
    return false;
  }
  return decision.candidates.every((candidate, index) => {
    const current = player.hand[index];
    return (
      current !== undefined &&
      candidate.visibility.type === "private" &&
      candidate.visibility.playerId === decision.playerId &&
      cardRefMatches(candidate.card, toCardRef(current, decision.playerId))
    );
  });
};

const findDecisionQueueEntry = (
  state: GameState,
  decision: SelectCardsDecision,
): EffectQueueEntry | undefined => {
  const causedBy = decision.causedBy;
  if (causedBy.type !== "effect") {
    return undefined;
  }
  return state.effectQueue.find(
    (entry) =>
      entry.id === causedBy.queueEntryId &&
      entry.effectBlockId === causedBy.effectId,
  );
};

const toTrashCard = (
  card: CardInstance,
  playerId: EffectQueueEntry["controllerId"],
  index: number,
): CardInstance => ({
  ...card,
  attachedDon: [],
  zone: { zone: "trash", playerId, slot: "trash", index },
});

export const applySupportedTrashFromHandChoiceResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): TrashFromHandResponseApplication => {
  const fail = (reason: string): TrashFromHandResponseApplication => ({
    ok: false,
    result: toEngineResult(state, [], invalidDecision(reason)),
  });

  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    !isTrashFromHandDecision(decision)
  ) {
    return fail("No active trashFromHand selectCards decision.");
  }
  if (decision.id !== action.decisionId) {
    return fail("Decision id does not match current trashFromHand decision.");
  }
  if (action.playerId !== decision.playerId) {
    return fail("Player does not match current trashFromHand decision.");
  }
  if (action.response.type !== "cards") {
    return fail("Response type must be cards for trashFromHand choices.");
  }

  const responseCards = (action.response as { cards?: unknown }).cards;
  if (!Array.isArray(responseCards) || !responseCards.every(isCardRef)) {
    return fail("Response cards must be CardRef values.");
  }
  if (responseCards.length !== decision.request.min) {
    return fail("Selected card count must match trashFromHand count.");
  }
  if (hasDuplicateInstanceIds(responseCards)) {
    return fail("Selected cards must not contain duplicates.");
  }
  if (!hasCurrentCandidateEnvelope(state, decision)) {
    return fail("trashFromHand decision envelope is stale or unsupported.");
  }

  const selectedCards = findCurrentHandCards(state, decision, responseCards);
  if (selectedCards === null) {
    return fail(
      "Selected cards must be active cards in the choosing player's hand.",
    );
  }
  const entry = findDecisionQueueEntry(state, decision);
  if (entry === undefined) {
    return fail("trashFromHand decision is stale for current effect queue.");
  }

  const player = state.players[decision.playerId];
  if (player === undefined) {
    return fail("Player does not match current trashFromHand decision.");
  }

  const selectedIds = new Set(selectedCards.map((card) => card.instanceId));
  const trashedCards = selectedCards.map((card, index) =>
    toTrashCard(card, decision.playerId, index),
  );
  const nextHand = reindexZoneCards(
    player.hand.filter((card) => !selectedIds.has(card.instanceId)),
    "hand",
    decision.playerId,
    "hand",
  );
  const nextTrash = reindexZoneCards(
    [...trashedCards, ...player.trash],
    "trash",
    decision.playerId,
    "trash",
  );

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
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }

  for (const selectedCard of selectedCards) {
    const trashedCard = nextTrash.find(
      (card) => card.instanceId === selectedCard.instanceId,
    );
    if (trashedCard === undefined) {
      return fail(
        "Selected cards must be active cards in the choosing player's hand.",
      );
    }
    appendEvent(
      state,
      events,
      "cardMoved",
      {
        from: "hand",
        to: "trash",
        playerId: decision.playerId,
        reason: "trashFromHand",
      },
      { type: "public" },
    );
    const cardMoved = events[events.length - 1];
    if (cardMoved !== undefined) {
      cardMoved.causedBy = { type: "decision", decisionId: decision.id };
    }
    appendEvent(
      state,
      events,
      "cardTrashed",
      {
        playerId: decision.playerId,
        instanceId: selectedCard.instanceId,
        cardId: selectedCard.cardId,
        reason: "trashFromHand",
      },
      { type: "public" },
    );
    const cardTrashed = events[events.length - 1];
    if (cardTrashed !== undefined) {
      cardTrashed.causedBy = { type: "decision", decisionId: decision.id };
    }
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [decision.playerId]: {
        ...player,
        hand: nextHand,
        trash: nextTrash,
      },
    },
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;

  return {
    allEvents: [...events],
    entry,
    eventBaseState: state,
    ok: true,
    resolutionEvents: events,
    state: nextState,
  };
};

export const getTrashFromHandDecisionLegalActions = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    decision.playerId !== playerId ||
    !isTrashFromHandDecision(decision)
  ) {
    return [];
  }
  const cards = decision.candidates
    .slice(0, decision.request.min)
    .map((candidate) => candidate.card);
  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      playerId: decision.playerId,
      response: { type: "cards", cards },
    },
  ];
};
