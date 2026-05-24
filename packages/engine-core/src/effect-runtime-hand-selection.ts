import type {
  Action,
  CardRef,
  Effect,
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
import {
  cardMatchesHandSelectionFilter,
  isSupportedHandSelectionCardFilter,
  toCardRef,
  zonesEqual,
} from "./action-state.js";
import { resumeSequenceFrameAfterHandSelection } from "./effect-runtime-sequence-frames.js";

type HandSelectCardsEffect = Extract<Effect, { type: "selectCards" }>;

const decisionIdPrefix = "decision:selectCards:hand-selection:";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

export const isSupportedSequenceHandSelectCardsEffect = (
  effect: Effect,
): effect is HandSelectCardsEffect =>
  effect.type === "selectCards" &&
  effect.zone === "hand" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  effect.visibility === "chooserOnly" &&
  String(effect.saveAs).startsWith("handSelection:") &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  Number.isInteger(effect.min) &&
  Number.isInteger(effect.max) &&
  effect.min >= 0 &&
  effect.max >= effect.min;

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

const isSupportedHandSelectCardsDecision = (
  decision: SelectCardsDecision,
): boolean =>
  String(decision.id).startsWith(decisionIdPrefix) &&
  decision.request.timing === "onResolution" &&
  decision.request.chooser === "self" &&
  decision.request.player === "self" &&
  decision.request.zone === "hand" &&
  decision.request.set === undefined &&
  !decision.request.allowFewerIfUnavailable &&
  decision.request.visibility === "privateToChooser" &&
  isSupportedHandSelectionCardFilter(decision.request.filter) &&
  decision.visibility.type === "private" &&
  decision.visibility.playerId === decision.playerId;

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

export const isHandSelectionSelectCardsDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is SelectCardsDecision =>
  decision.type === "selectCards" &&
  isSupportedHandSelectCardsDecision(decision);

const hasCurrentCandidateEnvelope = (
  state: GameState,
  decision: SelectCardsDecision,
): boolean => {
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return false;
  }
  const filteredHand = player.hand
    .filter((card) =>
      cardMatchesHandSelectionFilter(
        state,
        decision.playerId,
        card,
        decision.request.filter,
      ),
    )
    .map((card) => toCardRef(card, decision.playerId));
  if (decision.candidates.length !== filteredHand.length) {
    return false;
  }
  return decision.candidates.every((candidate, index) => {
    const current = filteredHand[index];
    return (
      current !== undefined &&
      candidate.visibility.type === "private" &&
      candidate.visibility.playerId === decision.playerId &&
      cardRefMatches(candidate.card, current)
    );
  });
};

const findCurrentHandCards = (
  state: GameState,
  decision: SelectCardsDecision,
  selected: readonly CardRef[],
): CardRef[] | null => {
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return null;
  }
  const candidateRefs = player.hand
    .filter((card) =>
      cardMatchesHandSelectionFilter(
        state,
        decision.playerId,
        card,
        decision.request.filter,
      ),
    )
    .map((card) => toCardRef(card, decision.playerId));
  const selectedRefs: CardRef[] = [];
  for (const ref of selected) {
    const match = candidateRefs.find((candidate) =>
      cardRefMatches(ref, candidate),
    );
    if (match === undefined) {
      return null;
    }
    selectedRefs.push(match);
  }
  return selectedRefs;
};

export const createSupportedHandSelectionChoiceDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: HandSelectCardsEffect,
  segmentIndex: number,
):
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
    } => {
  if (
    effect.zone !== "hand" ||
    effect.player !== "self" ||
    effect.chooser !== "self" ||
    effect.visibility !== "chooserOnly" ||
    !isSupportedHandSelectionCardFilter(effect.filter) ||
    !String(effect.saveAs).startsWith("handSelection:")
  ) {
    return {
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason: "unsupported-hand-selection-shape" },
      },
      events: [],
      ok: false,
      state,
    };
  }
  const resolvedFilter = effect.filter;
  if (
    !Number.isInteger(effect.min) ||
    !Number.isInteger(effect.max) ||
    effect.min < 0 ||
    effect.max < effect.min
  ) {
    return {
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason: "unsupported-hand-selection-cardinality" },
      },
      events: [],
      ok: false,
      state,
    };
  }
  const player = state.players[entry.controllerId];
  if (player === undefined) {
    return {
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason: "unsupported-hand-selection-player" },
      },
      events: [],
      ok: false,
      state,
    };
  }

  const candidates = player.hand
    .filter((card) =>
      cardMatchesHandSelectionFilter(
        state,
        entry.controllerId,
        card,
        resolvedFilter,
      ),
    )
    .map((card) => ({
      card: toCardRef(card, entry.controllerId),
      visibility: {
        type: "private" as const,
        playerId: entry.controllerId,
      },
    }));

  if (candidates.length < effect.min) {
    return {
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason: "insufficient-hand-selection-candidates" },
      },
      events: [],
      ok: false,
      state,
    };
  }

  const causedBy = {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  } as const;
  const visibility = { type: "private", playerId: entry.controllerId } as const;
  const pendingDecision: SelectCardsDecision = {
    id: toDecisionId(
      `${decisionIdPrefix}${String(entry.id)}:${String(segmentIndex)}`,
    ),
    type: "selectCards",
    playerId: entry.controllerId,
    prompt: "Choose cards from hand.",
    causedBy,
    visibility,
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "hand",
      min: effect.min,
      max: effect.max,
      allowFewerIfUnavailable: false,
      visibility: "privateToChooser",
      ...(resolvedFilter === undefined ? {} : { filter: resolvedFilter }),
    },
    candidates,
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

export const getHandSelectionDecisionLegalActions = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    decision.playerId !== playerId ||
    !isSupportedHandSelectCardsDecision(decision)
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

export const applySupportedHandSelectionChoiceResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    !isSupportedHandSelectCardsDecision(decision)
  ) {
    return null;
  }
  if (decision.id !== action.decisionId) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Decision id does not match current hand-selection decision.",
      ),
    );
  }
  if (hasMalformedRespondToDecisionPlayerId(action)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Player does not match current hand-selection decision."),
    );
  }
  if (getRespondingPlayerId(action, decision.playerId) !== decision.playerId) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Player does not match current hand-selection decision."),
    );
  }
  if (action.response.type !== "cards") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Response type must be cards for hand-selection choices.",
      ),
    );
  }
  const responseCards = (action.response as { cards?: unknown }).cards;
  if (!Array.isArray(responseCards) || !responseCards.every(isCardRef)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response cards must be CardRef values."),
    );
  }
  if (
    responseCards.length < decision.request.min ||
    responseCards.length > decision.request.max
  ) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Selected card count must be within hand-selection bounds.",
      ),
    );
  }
  if (hasDuplicateInstanceIds(responseCards)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected cards must not contain duplicates."),
    );
  }
  if (!hasCurrentCandidateEnvelope(state, decision)) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "hand-selection decision envelope is stale or unsupported.",
      ),
    );
  }
  const selectedCards = findCurrentHandCards(state, decision, responseCards);
  if (selectedCards === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Selected cards must be active cards in the choosing player's hand.",
      ),
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
      selectedCount: selectedCards.length,
    },
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;

  const resumed = resumeSequenceFrameAfterHandSelection(
    nextState,
    decision,
    selectedCards,
  );
  if (resumed === undefined) {
    return null;
  }
  if (!resumed.ok) {
    return toEngineResult(state, [], [resumed.error]);
  }
  return toEngineResult(resumed.state, [...events, ...resumed.events]);
};
