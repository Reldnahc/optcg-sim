import type {
  Action,
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  LifeCard,
  OrderCardsDecision,
  PlayerId,
  SequenceSegmentResult,
} from "@optcg/types";

import {
  appendEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
  type EngineResultOptions,
} from "../action-results.js";
import { getOpponentId } from "../actions/state.js";
import type { SegmentLedgers } from "./runner.js";

type ReorderLifeEffect = Extract<Effect, { type: "reorderLife" }>;
type MoveLifeToDeckTopAndReorderRestEffect = Extract<
  Effect,
  { type: "moveLifeToDeckTopAndReorderRest" }
>;
type PlaceTopLifeCardEffect = Extract<Effect, { type: "placeTopLifeCard" }>;
type SetLifeFaceUpEffect = Extract<Effect, { type: "setLifeFaceUp" }>;
type SequenceEffect = Extract<Effect, { type: "sequence" }>;
const topLifePlacementDecisionPrefix =
  "decision:orderCards:top-life-placement:";
const lifeToDeckTopDecisionPrefix = "decision:orderCards:life-to-deck-top:";

const reindexLife = (
  life: readonly LifeCard[],
  playerId: PlayerId,
): LifeCard[] =>
  life.map((lifeCard, index) => ({
    ...lifeCard,
    card: {
      ...lifeCard.card,
      zone: { zone: "life", playerId, slot: "life", index },
    },
  }));

const reindexDeck = (
  deck: readonly CardInstance[],
  playerId: PlayerId,
): CardInstance[] =>
  deck.map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId, slot: "deck", index },
  }));

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

const resolveEffectPlayer = (
  state: GameState,
  entry: EffectQueueEntry,
  player: ReorderLifeEffect["player"],
) => {
  if (player === "self") return entry.controllerId;
  if (player === "opponent") return getOpponentId(state, entry.controllerId);
  return null;
};

const lifeCardRef = (lifeCard: LifeCard, playerId: PlayerId): CardRef => ({
  instanceId: lifeCard.card.instanceId,
  cardId: lifeCard.card.cardId,
  playerId,
  zone: lifeCard.card.zone,
});

export const createLifeReorderDecisionForSequenceSegment = (params: {
  effect: ReorderLifeEffect;
  entry: EffectQueueEntry;
  index: number;
  state: GameState;
}): { events: EngineEvent[]; ok: true; state: GameState } | { ok: false } => {
  const targetPlayerId = resolveEffectPlayer(
    params.state,
    params.entry,
    params.effect.player,
  );
  const viewerPlayerId = resolveEffectPlayer(
    params.state,
    params.entry,
    params.effect.viewer,
  );
  const targetPlayer =
    targetPlayerId === null ? undefined : params.state.players[targetPlayerId];
  if (
    targetPlayerId === null ||
    viewerPlayerId === null ||
    targetPlayer === undefined
  ) {
    return { ok: false };
  }

  const visibility = { type: "private", playerId: viewerPlayerId } as const;
  const decision: OrderCardsDecision = {
    id: toDecisionId(
      `decision:orderCards:life-reorder:${String(params.entry.id)}:${String(params.index)}`,
    ),
    type: "orderCards",
    playerId: viewerPlayerId,
    prompt: "Place Life cards back in any order.",
    causedBy: {
      type: "effect",
      queueEntryId: params.entry.id,
      effectId: params.entry.effectBlockId,
    },
    visibility,
    cards: targetPlayer.life.map((lifeCard) =>
      lifeCardRef(lifeCard, targetPlayerId),
    ),
    destination: "life",
    defaultResponse: {
      type: "orderedIds",
      ids: targetPlayer.life.map((lifeCard) => lifeCard.card.instanceId),
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
    visibility,
  );
  const event = events[0];
  if (event !== undefined) {
    event.causedBy = decision.causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...params.state,
      seq: toStateSeq(params.state.seq + 1),
      pendingDecision: decision,
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

export const createTopLifePlacementDecisionForSequenceSegment = (params: {
  effect: PlaceTopLifeCardEffect;
  entry: EffectQueueEntry;
  index: number;
  state: GameState;
}): { events: EngineEvent[]; ok: true; state: GameState } | { ok: false } => {
  const viewerPlayerId = resolveEffectPlayer(
    params.state,
    params.entry,
    params.effect.viewer,
  );
  if (viewerPlayerId === null) {
    return { ok: false };
  }
  const cards = params.effect.players.flatMap((playerRef) => {
    const playerId = resolveEffectPlayer(params.state, params.entry, playerRef);
    const player =
      playerId === null ? undefined : params.state.players[playerId];
    const topLife = player?.life[0];
    return playerId === null || topLife === undefined
      ? []
      : [lifeCardRef(topLife, playerId)];
  });
  const visibility = { type: "private", playerId: viewerPlayerId } as const;
  const decision: OrderCardsDecision = {
    id: toDecisionId(
      `${topLifePlacementDecisionPrefix}${String(params.entry.id)}:${String(params.index)}`,
    ),
    type: "orderCards",
    playerId: viewerPlayerId,
    prompt: "Place up to 1 top Life card at the top or bottom.",
    causedBy: {
      type: "effect",
      queueEntryId: params.entry.id,
      effectId: params.entry.effectBlockId,
    },
    visibility,
    cards,
    destination: "life",
    placement: { type: "topOrBottom" },
    defaultResponse: { type: "topBottomPlacement", topIds: [], bottomIds: [] },
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
    visibility,
  );
  const event = events[0];
  if (event !== undefined) {
    event.causedBy = decision.causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...params.state,
      seq: toStateSeq(params.state.seq + 1),
      pendingDecision: decision,
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

export const createLifeToDeckTopDecisionForSequenceSegment = (params: {
  effect: MoveLifeToDeckTopAndReorderRestEffect;
  entry: EffectQueueEntry;
  index: number;
  state: GameState;
}): { events: EngineEvent[]; ok: true; state: GameState } | { ok: false } => {
  const targetPlayerId = resolveEffectPlayer(
    params.state,
    params.entry,
    params.effect.player,
  );
  const viewerPlayerId = resolveEffectPlayer(
    params.state,
    params.entry,
    params.effect.viewer,
  );
  const targetPlayer =
    targetPlayerId === null ? undefined : params.state.players[targetPlayerId];
  if (
    targetPlayerId === null ||
    viewerPlayerId === null ||
    targetPlayer === undefined ||
    targetPlayer.life.length === 0
  ) {
    return { ok: false };
  }

  const visibility = { type: "private", playerId: viewerPlayerId } as const;
  const decision: OrderCardsDecision = {
    id: toDecisionId(
      `${lifeToDeckTopDecisionPrefix}${String(params.entry.id)}:${String(params.index)}`,
    ),
    type: "orderCards",
    playerId: viewerPlayerId,
    prompt:
      "Place the first card on top of your deck and the rest back in Life.",
    causedBy: {
      type: "effect",
      queueEntryId: params.entry.id,
      effectId: params.entry.effectBlockId,
    },
    visibility,
    cards: targetPlayer.life.map((lifeCard) =>
      lifeCardRef(lifeCard, targetPlayerId),
    ),
    destination: "life",
    defaultResponse: {
      type: "orderedIds",
      ids: targetPlayer.life.map((lifeCard) => lifeCard.card.instanceId),
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
    visibility,
  );
  const event = events[0];
  if (event !== undefined) {
    event.causedBy = decision.causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...params.state,
      seq: toStateSeq(params.state.seq + 1),
      pendingDecision: decision,
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

export const applySetLifeFaceUpSequenceSegment = (params: {
  effect: SetLifeFaceUpEffect;
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number];
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  state: GameState;
}): { ledgers: SegmentLedgers; ok: true; state: GameState } | { ok: false } => {
  const playerId =
    params.effect.player === "self"
      ? params.entry.controllerId
      : getOpponentId(params.state, params.entry.controllerId);
  const player = playerId === null ? undefined : params.state.players[playerId];
  if (playerId === null || player === undefined) {
    return { ok: false };
  }
  const nextLife = player.life.map((lifeCard) => ({
    ...lifeCard,
    faceUp: params.effect.faceUp,
  }));
  const changed = player.life.some(
    (lifeCard) => lifeCard.faceUp !== params.effect.faceUp,
  );
  return {
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: changed,
        },
      },
    },
    ok: true,
    state: {
      ...params.state,
      ...(changed ? { seq: toStateSeq(params.state.seq + 1) } : {}),
      players: {
        ...params.state.players,
        [playerId]: { ...player, life: nextLife },
      },
    },
  };
};

export const applyLifeToDeckTopDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "orderCards" ||
    !String(decision.id).startsWith(lifeToDeckTopDecisionPrefix) ||
    action.decisionId !== decision.id ||
    action.response.type !== "orderedIds"
  ) {
    return null;
  }
  const fail = (reason: string): EngineResult =>
    toEngineResult(state, [], [{ type: "invalidDecisionResponse", reason }]);
  const targetPlayerId = decision.cards[0]?.playerId;
  const targetPlayer =
    targetPlayerId === undefined ? undefined : state.players[targetPlayerId];
  if (targetPlayerId === undefined || targetPlayer === undefined) {
    return fail("Life card owner is missing.");
  }
  const expectedIds = new Set(
    decision.cards.map((card) => String(card.instanceId)),
  );
  if (
    action.response.ids.length !== expectedIds.size ||
    action.response.ids.some((id) => !expectedIds.has(id))
  ) {
    return fail("Ordered Life ids must match the available Life cards.");
  }
  const byId = new Map(
    targetPlayer.life.map((lifeCard) => [
      String(lifeCard.card.instanceId),
      lifeCard,
    ]),
  );
  const orderedLife = action.response.ids
    .map((id) => byId.get(id))
    .filter(isDefined);
  const deckTop = orderedLife[0];
  if (
    deckTop === undefined ||
    orderedLife.length !== targetPlayer.life.length
  ) {
    return fail("Ordered Life ids must resolve to current Life cards.");
  }
  const restLife = orderedLife.slice(1);
  const movedDeckCard = {
    ...deckTop.card,
    zone: {
      zone: "deck" as const,
      playerId: targetPlayerId,
      slot: "deck" as const,
      index: 0,
    },
  };
  const nextDeck = reindexDeck(
    [movedDeckCard, ...targetPlayer.deck],
    targetPlayerId,
  );
  const nextLife = reindexLife(restLife, targetPlayerId);
  const stateWithoutPendingDecision: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [targetPlayerId]: {
        ...targetPlayer,
        deck: nextDeck,
        life: nextLife,
      },
    },
  };
  delete stateWithoutPendingDecision.pendingDecision;
  const events: EngineEvent[] = [];
  appendEvent(
    stateWithoutPendingDecision,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: "orderedIds",
    },
    decision.visibility,
  );
  const event = events[0];
  if (event !== undefined) {
    event.causedBy = { type: "decision", decisionId: decision.id };
  }
  return toEngineResult(
    {
      ...stateWithoutPendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};

export const applyLifeReorderDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: EngineResultOptions = {},
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "orderCards" ||
    !String(decision.id).startsWith("decision:orderCards:life-reorder:") ||
    action.decisionId !== decision.id ||
    action.response.type !== "orderedIds"
  ) {
    return null;
  }
  const targetPlayerId = decision.cards[0]?.playerId;
  const targetPlayer =
    targetPlayerId === undefined ? undefined : state.players[targetPlayerId];
  if (targetPlayerId === undefined || targetPlayer === undefined) {
    return null;
  }
  const expectedIds = new Set(
    decision.cards.map((card) => String(card.instanceId)),
  );
  if (
    action.response.ids.length !== expectedIds.size ||
    action.response.ids.some((id) => !expectedIds.has(id))
  ) {
    return null;
  }
  const byId = new Map(
    targetPlayer.life.map((lifeCard) => [
      String(lifeCard.card.instanceId),
      lifeCard,
    ]),
  );
  const nextLife = reindexLife(
    action.response.ids.map((id) => byId.get(id)).filter(isDefined),
    targetPlayerId,
  );
  if (nextLife.length !== targetPlayer.life.length) {
    return null;
  }
  const stateWithoutPendingDecision: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [targetPlayerId]: { ...targetPlayer, life: nextLife },
    },
  };
  delete stateWithoutPendingDecision.pendingDecision;
  const events: EngineEvent[] = [];
  appendEvent(
    stateWithoutPendingDecision,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: "orderedIds",
    },
    decision.visibility,
  );
  const event = events[0];
  if (event !== undefined) {
    event.causedBy = { type: "decision", decisionId: decision.id };
  }
  return toEngineResult(
    {
      ...stateWithoutPendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
    undefined,
    options,
  );
};

export const applyTopLifePlacementDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: EngineResultOptions = {},
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "orderCards" ||
    !String(decision.id).startsWith(topLifePlacementDecisionPrefix) ||
    action.decisionId !== decision.id
  ) {
    return null;
  }
  const fail = (reason: string): EngineResult =>
    toEngineResult(
      state,
      [],
      [{ type: "invalidDecisionResponse", reason }],
      options,
    );
  if (action.response.type !== "topBottomPlacement") {
    return fail("Response type must be topBottomPlacement.");
  }
  const selectedIds = [
    ...action.response.topIds.map(String),
    ...action.response.bottomIds.map(String),
  ];
  if (
    selectedIds.length > 1 ||
    new Set(selectedIds).size !== selectedIds.length
  ) {
    return fail("Choose at most 1 top Life card.");
  }
  const expectedIds = new Set(
    decision.cards.map((card) => String(card.instanceId)),
  );
  if (selectedIds.some((id) => !expectedIds.has(id))) {
    return fail("Selected Life card must be one of the top Life candidates.");
  }

  const selectedId = selectedIds[0];
  const selectedPlacement =
    selectedId === undefined
      ? undefined
      : action.response.topIds.map(String).includes(selectedId)
        ? "top"
        : "bottom";
  let nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
  };
  delete nextState.pendingDecision;

  if (selectedId !== undefined && selectedPlacement !== undefined) {
    const selected = decision.cards.find(
      (card) => String(card.instanceId) === selectedId,
    );
    const targetPlayerId = selected?.playerId;
    const targetPlayer =
      targetPlayerId === undefined ? undefined : state.players[targetPlayerId];
    if (targetPlayerId === undefined || targetPlayer === undefined) {
      return fail("Selected Life card owner is missing.");
    }
    const topLife = targetPlayer.life[0];
    if (
      topLife === undefined ||
      String(topLife.card.instanceId) !== selectedId
    ) {
      return fail("Selected card is no longer the top Life card.");
    }
    const remainingLife = targetPlayer.life.slice(1);
    const nextLife = reindexLife(
      selectedPlacement === "top"
        ? [topLife, ...remainingLife]
        : [...remainingLife, topLife],
      targetPlayerId,
    );
    nextState = {
      ...nextState,
      players: {
        ...nextState.players,
        [targetPlayerId]: { ...targetPlayer, life: nextLife },
      },
    };
  }

  const events: EngineEvent[] = [];
  appendEvent(
    nextState,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: "topBottomPlacement",
    },
    decision.visibility,
  );
  const event = events[0];
  if (event !== undefined) {
    event.causedBy = { type: "decision", decisionId: decision.id };
  }
  return toEngineResult(
    { ...nextState, eventJournal: [...nextState.eventJournal, ...events] },
    events,
    undefined,
    options,
  );
};
