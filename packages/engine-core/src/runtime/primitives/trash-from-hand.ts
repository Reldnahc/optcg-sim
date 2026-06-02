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
} from "../../action-results.js";
import { toCardRef, zonesEqual } from "../../action-state.js";
import { moveConcreteCardsToTrash } from "../../concrete-card-movement.js";
import { resolvePlayerId } from "./draw.js";
import { resumeSequenceFrameAfterTrashFromHand } from "../../effect-runtime-sequence-frames.js";

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
  | {
      chooserId: EffectQueueEntry["controllerId"];
      ok: true;
      playerId: EffectQueueEntry["controllerId"];
    }
  | { ok: false; reason: TrashFromHandFailureReason } => {
  if (effect.player !== "self" && effect.player !== "opponent") {
    return { ok: false, reason: "unsupported-player-ref" };
  }
  if (effect.chooser !== "self" && effect.chooser !== "opponent") {
    return { ok: false, reason: "unsupported-chooser-ref" };
  }
  if (effect.chooser !== effect.player) {
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
  if (playerId === undefined) {
    return { ok: false, reason: "unsupported-player-ref" };
  }
  if (chooserId === undefined || chooserId !== playerId) {
    return { ok: false, reason: "unsupported-chooser-ref" };
  }
  const player = state.players[playerId];
  if (player === undefined || player.hand.length < effect.count) {
    return { ok: false, reason: "insufficient-hand-cards" };
  }
  return { chooserId, ok: true, playerId };
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
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  effect.effect.type === "trashFromHand" &&
  (effect.effect.player === "self" || effect.effect.player === "opponent") &&
  effect.effect.chooser === effect.effect.player &&
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
  const visibility = {
    type: "private",
    playerId: supported.chooserId,
  } as const;
  const pendingDecision: SelectCardsDecision = {
    id: decisionIdForEntry(entry),
    type: "selectCards",
    playerId: supported.chooserId,
    prompt: "Choose cards from hand to trash.",
    causedBy,
    visibility,
    request: {
      timing: "onResolution",
      chooser: effect.chooser,
      player: effect.player,
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
  (decision.request.chooser === "self" ||
    decision.request.chooser === "opponent") &&
  decision.request.chooser === decision.request.player &&
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
  if (hasMalformedRespondToDecisionPlayerId(action)) {
    return fail("Player does not match current trashFromHand decision.");
  }
  if (getRespondingPlayerId(action, decision.playerId) !== decision.playerId) {
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

  const movedResult = moveConcreteCardsToTrash(state, events, selectedCards, {
    cardMovedPayloadShape: "publicZoneNames",
    cardMovedVisibility: { type: "public" },
    cardTrashedVisibility: { type: "public" },
    causedBy: { type: "decision", decisionId: decision.id },
    clearAttachedDon: true,
    emitCardTrashed: true,
    playerId: decision.playerId,
    reason: "trashFromHand",
    sourceZone: "hand",
  });

  let nextState: GameState = {
    ...movedResult.state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;

  const selectedRefs = selectedCards.map((card) =>
    toCardRef(card, decision.playerId),
  );
  const sequenceResume = resumeSequenceFrameAfterTrashFromHand(
    nextState,
    decision,
    selectedRefs,
  );
  if (sequenceResume !== undefined) {
    if (!sequenceResume.ok) {
      return {
        ok: false,
        result: toEngineResult(state, [], [sequenceResume.error]),
      };
    }
    nextState = sequenceResume.state;
    events.push(...sequenceResume.events);
  }

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
      response: { type: "cards", cards },
    },
  ];
};
