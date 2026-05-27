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
  LegalAction,
  PlayerId,
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
  reindexZoneCards,
  toCardRef,
  zonesEqual,
} from "./action-state.js";
import { evaluateQueuedEffectCondition } from "./effect-runtime-conditions.js";

const decisionIdPrefix = "decision:selectCards:counter-trash-to-hand:";

const invalidDecision = (
  reason: string,
): readonly [EngineError, ...EngineError[]] => [
  { type: "invalidDecisionResponse", reason },
];

const cardRefMatches = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  left.zone !== undefined &&
  right.zone !== undefined &&
  zonesEqual(left.zone, right.zone);

const hasDuplicateInstanceIds = (cards: readonly CardRef[]): boolean =>
  new Set(cards.map((card) => card.instanceId)).size !== cards.length;

const isCardRef = (value: unknown): value is CardRef => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const zone = candidate["zone"];
  return (
    typeof candidate["instanceId"] === "string" &&
    typeof candidate["cardId"] === "string" &&
    typeof candidate["playerId"] === "string" &&
    typeof zone === "object" &&
    zone !== null
  );
};

const toCounterEventQueueEntry = (
  state: GameState,
  controllerId: PlayerId,
  source: CardInstance,
): EffectQueueEntry => {
  const metadata = state.cardManifest.cards[source.cardId];
  return {
    id: `queue-entry:counter-event-trailing:${String(source.instanceId)}` as EffectQueueEntry["id"],
    state: "resolving",
    timingWindowId:
      `timing-window:counter-event-trailing:${String(source.instanceId)}` as EffectQueueEntry["timingWindowId"],
    generation: 0,
    controllerId,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: controllerId,
      zone: source.zone,
    },
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId,
      zone: source.zone,
      category: metadata?.category ?? "event",
      colors: metadata?.colors ?? [],
      ...(metadata?.cost === undefined ? {} : { cost: metadata.cost }),
      keywords: metadata?.printedKeywords ?? [],
    },
    effectBlockId:
      `${String(source.cardId)}:counter:trailing` as EffectQueueEntry["effectBlockId"],
    orderingGroup: "nonTurnPlayer",
    createdAtEventSeq: state.eventJournal.length,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "resolveFromDestinationZone",
    causedBy: { type: "ruleProcess", name: "counterStep" },
  };
};

const toTrashToHandShape = (
  effect: Extract<Effect, { type: "sequence" }>,
):
  | {
      condition: Extract<Effect, { type: "conditional" }>["if"];
      select: Extract<Effect, { type: "selectCards" }>;
      move: Extract<Effect, { type: "moveSelected" }>;
    }
  | undefined => {
  const [first] = effect.effects;
  const conditional = first?.effect;
  if (
    first === undefined ||
    first.connector !== "always" ||
    conditional === undefined ||
    conditional.type !== "conditional" ||
    conditional.then.type !== "sequence"
  ) {
    return undefined;
  }
  const [selectSegment, moveSegment] = conditional.then.effects;
  if (
    selectSegment?.effect.type !== "selectCards" ||
    moveSegment?.effect.type !== "moveSelected"
  ) {
    return undefined;
  }
  return {
    condition: conditional.if,
    select: selectSegment.effect,
    move: moveSegment.effect,
  };
};

export const createCounterEventTrashToHandDecision = (
  state: GameState,
  controllerId: PlayerId,
  source: CardInstance,
  effect: Extract<Effect, { type: "sequence" }>,
): { events: EngineEvent[]; state: GameState } | null => {
  const shape = toTrashToHandShape(effect);
  const player = state.players[controllerId];
  if (
    shape === undefined ||
    player === undefined ||
    shape.select.zone !== "trash" ||
    shape.select.player !== "self" ||
    shape.select.chooser !== "self" ||
    shape.select.visibility !== "bothPlayers" ||
    shape.move.from !== "trash" ||
    shape.move.to !== "hand" ||
    shape.move.selection !== shape.select.saveAs
  ) {
    return null;
  }
  const condition = evaluateQueuedEffectCondition(
    state,
    toCounterEventQueueEntry(state, controllerId, source),
    shape.condition,
  );
  if (!condition.supported) {
    return null;
  }
  if (!condition.passed) {
    return { events: [], state };
  }
  const candidates = player.trash
    .filter((card) =>
      cardMatchesHandSelectionFilter(
        state,
        controllerId,
        card,
        shape.select.filter,
      ),
    )
    .map((card) => ({
      card: toCardRef(card, controllerId),
      visibility: { type: "public" as const },
    }));
  const decision: SelectCardsDecision = {
    id: toDecisionId(
      `${decisionIdPrefix}${String(source.instanceId)}:${String(state.seq + 1)}`,
    ),
    type: "selectCards",
    playerId: controllerId,
    prompt: "Choose cards from trash.",
    causedBy: {
      type: "effect",
      queueEntryId: toCounterEventQueueEntry(state, controllerId, source).id,
      effectId: toCounterEventQueueEntry(state, controllerId, source)
        .effectBlockId,
    },
    visibility: { type: "public" },
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "trash",
      min: shape.select.min,
      max: shape.select.max,
      allowFewerIfUnavailable: true,
      visibility: "public",
      ...(shape.select.filter === undefined
        ? {}
        : { filter: shape.select.filter }),
    },
    candidates,
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
    },
    decision.visibility,
  );
  return {
    events,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision: decision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

export const isCounterEventTrashToHandDecision = (
  decision: NonNullable<GameState["pendingDecision"]> | undefined,
): boolean =>
  decision?.type === "selectCards" &&
  String(decision.id).startsWith(decisionIdPrefix);

export const getCounterEventTrashToHandLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    !isCounterEventTrashToHandDecision(decision) ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
  ];
};

export const applyCounterEventTrashToHandResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  createNextCounterDecision: (state: GameState) => GameState["pendingDecision"],
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    !isCounterEventTrashToHandDecision(decision)
  ) {
    return null;
  }
  if (decision.id !== action.decisionId || action.response.type !== "cards") {
    return toEngineResult(
      state,
      [],
      invalidDecision("Invalid trash-to-hand response."),
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
    responseCards.length > decision.request.max ||
    hasDuplicateInstanceIds(responseCards)
  ) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected card count is invalid."),
    );
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Decision player is missing."),
    );
  }
  const candidateRefs = decision.candidates.map((candidate) => candidate.card);
  if (
    !responseCards.every((selected) =>
      candidateRefs.some((candidate) => cardRefMatches(candidate, selected)),
    )
  ) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected cards must be legal trash candidates."),
    );
  }
  const selectedIds = new Set(responseCards.map((card) => card.instanceId));
  const movedCards = player.trash.filter((card) =>
    selectedIds.has(card.instanceId),
  );
  const nextTrash = reindexZoneCards(
    player.trash.filter((card) => !selectedIds.has(card.instanceId)),
    "trash",
    decision.playerId,
    "trash",
  );
  const nextHand = reindexZoneCards(
    [...player.hand, ...movedCards],
    "hand",
    decision.playerId,
    "hand",
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
  for (const card of movedCards) {
    appendEvent(state, events, "cardMoved", {
      instanceId: card.instanceId,
      cardId: card.cardId,
      from: card.zone,
      to: {
        zone: "hand",
        playerId: decision.playerId,
        slot: "hand",
        index: nextHand.findIndex(
          (candidate) => candidate.instanceId === card.instanceId,
        ),
      },
      reason: "effect",
    });
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
  const nextDecision = createNextCounterDecision(nextState);
  if (nextDecision === undefined) {
    delete nextState.pendingDecision;
  } else {
    nextState.pendingDecision = nextDecision;
  }
  return toEngineResult(nextState, events);
};
