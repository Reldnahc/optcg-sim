import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LifeCard,
  PlayerId,
} from "@optcg/types";

import { toEngineResult, toStateSeq } from "../action-results.js";
import { addCardsToHand, reindexZoneCards } from "../actions/state.js";
import { moveConcreteCardsToTrash } from "./concrete-card-movement.js";
import { resolvePlayerId } from "../runtime/primitives/execute.js";
import { isScopedActivateMainQueueEntry } from "../runtime/optional-activation/activate-main-support.js";

export type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;

type MoveCardsExecutionFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-player-ref"
  | "invalid-move-count";

interface EffectExecutionErrorDetails {
  reason: MoveCardsExecutionFailureReason;
}

const moveCardsExecutionError = (
  effectId: string,
  reason: MoveCardsExecutionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies EffectExecutionErrorDetails,
});

export const isSupportedDeckTopToTrashEffect = (
  effect: Effect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" &&
  Number.isInteger(effect.count) &&
  effect.count > 0 &&
  effect.from.player === "self" &&
  effect.from.zone === "deck" &&
  effect.from.position === "top" &&
  effect.to.player === "self" &&
  effect.to.zone === "trash" &&
  effect.to.position === undefined;

export const isSupportedDonDeckToCostAreaEffect = (
  effect: Effect,
): effect is MoveCardsEffect & { destinationState: "active" | "rested" } =>
  effect.type === "moveCards" &&
  (effect.min === undefined ||
    (Number.isInteger(effect.min) && effect.min >= 0)) &&
  Number.isInteger(effect.count) &&
  effect.count > 0 &&
  (effect.min ?? effect.count) <= effect.count &&
  (effect.from.player === "self" || effect.from.player === "opponent") &&
  (effect.chooser === undefined ||
    effect.chooser === "self" ||
    effect.chooser === "opponent") &&
  effect.from.zone === "donDeck" &&
  effect.from.position === "top" &&
  effect.to.player === effect.from.player &&
  effect.to.zone === "costArea" &&
  effect.to.position === undefined &&
  (effect.destinationState === "active" ||
    effect.destinationState === "rested");

export const isSupportedLifeTopToHandEffect = (
  effect: Effect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" &&
  (effect.min === undefined ||
    (Number.isInteger(effect.min) && effect.min >= 0)) &&
  Number.isInteger(effect.count) &&
  effect.count > 0 &&
  (effect.min ?? effect.count) <= effect.count &&
  (effect.from.player === "self" || effect.from.player === "opponent") &&
  effect.from.zone === "life" &&
  effect.from.position === "top" &&
  (effect.to.player === effect.from.player || effect.to.player === "owner") &&
  effect.to.zone === "hand" &&
  effect.to.position === undefined;

export const isSupportedLifeBottomToHandEffect = (
  effect: Effect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" &&
  Number.isInteger(effect.count) &&
  effect.count > 0 &&
  effect.from.player === "self" &&
  effect.from.zone === "life" &&
  effect.from.position === "bottom" &&
  effect.to.player === "self" &&
  effect.to.zone === "hand" &&
  effect.to.position === undefined;

export const isSupportedLifeTopToTrashEffect = (
  effect: Effect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" &&
  (effect.min === undefined ||
    (Number.isInteger(effect.min) && effect.min >= 0)) &&
  Number.isInteger(effect.count) &&
  effect.count > 0 &&
  (effect.min ?? effect.count) <= effect.count &&
  (effect.from.player === "self" || effect.from.player === "opponent") &&
  effect.from.zone === "life" &&
  effect.from.position === "top" &&
  effect.to.player === effect.from.player &&
  effect.to.zone === "trash" &&
  effect.to.position === undefined;

export const isSupportedDeckTopToLifeTopEffect = (
  effect: Effect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" &&
  (effect.min === undefined ||
    (Number.isInteger(effect.min) && effect.min >= 0)) &&
  Number.isInteger(effect.count) &&
  effect.count > 0 &&
  (effect.min ?? effect.count) <= effect.count &&
  effect.from.player === "self" &&
  effect.from.zone === "deck" &&
  effect.from.position === "top" &&
  effect.to.player === "self" &&
  effect.to.zone === "life" &&
  effect.to.position === "top";

export const isSupportedEffectSourceTrashToHandEffect = (
  effect: Effect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" &&
  effect.count === 1 &&
  effect.min === undefined &&
  effect.from.player === "self" &&
  effect.from.zone === "trash" &&
  effect.from.position === undefined &&
  effect.from.source === "effectSource" &&
  effect.to.player === "self" &&
  effect.to.zone === "hand" &&
  effect.to.position === undefined &&
  effect.destinationState === undefined;

export const isSupportedMoveCardsEffect = (
  effect: Effect,
): effect is MoveCardsEffect =>
  isSupportedDeckTopToTrashEffect(effect) ||
  isSupportedDonDeckToCostAreaEffect(effect) ||
  isSupportedLifeTopToHandEffect(effect) ||
  isSupportedLifeBottomToHandEffect(effect) ||
  isSupportedLifeTopToTrashEffect(effect) ||
  isSupportedDeckTopToLifeTopEffect(effect) ||
  isSupportedEffectSourceTrashToHandEffect(effect);

const hasSupportedMoveCardsEffectEnvelope = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: MoveCardsEffect;
} =>
  effect.optional !== true &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  isSupportedMoveCardsEffect(effect.effect);

export const isSupportedMoveCardsEffectBlock = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: MoveCardsEffect;
} => effect.category === "auto" && hasSupportedMoveCardsEffectEnvelope(effect);

const isSupportedActivateMainMoveCardsEffectBlock = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: MoveCardsEffect;
} =>
  effect.category === "activate" &&
  effect.trigger.type === "activateMain" &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  hasSupportedMoveCardsEffectEnvelope(effect);

export const resolveSupportedQueuedMoveCardsEffect = (
  effect: EffectDefinition["effects"][number] | undefined,
  entry: EffectQueueEntry,
): MoveCardsEffect | undefined =>
  effect !== undefined &&
  effect.sourcePresencePolicy === entry.sourcePresencePolicy &&
  (isSupportedMoveCardsEffectBlock(effect) ||
    (isScopedActivateMainQueueEntry(entry) &&
      isSupportedActivateMainMoveCardsEffectBlock(effect)))
    ? effect.effect
    : undefined;

export const executeMoveCardsPrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
  options: { incrementStateSeq?: boolean } = {},
): EngineResult => {
  if (!isSupportedMoveCardsEffect(effect)) {
    return toEngineResult(
      state,
      [],
      [
        moveCardsExecutionError(
          entry.effectBlockId,
          "unsupported-effect-shape",
        ),
      ],
    );
  }
  if (!Number.isInteger(effect.count) || effect.count <= 0) {
    return toEngineResult(
      state,
      [],
      [moveCardsExecutionError(entry.effectBlockId, "invalid-move-count")],
    );
  }

  const fromPlayerId = resolvePlayerId(state, entry, effect.from.player);
  const resolvedToPlayerId = resolvePlayerId(state, entry, effect.to.player);
  const toPlayerId =
    effect.to.player === "owner" &&
    (effect.from.zone === "life" ||
      effect.from.zone === "deck" ||
      effect.from.zone === "trash" ||
      effect.from.zone === "hand")
      ? fromPlayerId
      : resolvedToPlayerId;
  if (
    fromPlayerId === undefined ||
    toPlayerId === undefined ||
    fromPlayerId !== toPlayerId
  ) {
    return toEngineResult(
      state,
      [],
      [moveCardsExecutionError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }
  const player = state.players[fromPlayerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      [moveCardsExecutionError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }

  if (isSupportedDonDeckToCostAreaEffect(effect)) {
    return executeDonDeckToCostAreaMove(
      state,
      entry,
      effect,
      fromPlayerId,
      options,
    );
  }
  if (isSupportedLifeTopToHandEffect(effect)) {
    return executeLifeTopToHandMove(
      state,
      entry,
      effect,
      fromPlayerId,
      options,
    );
  }
  if (isSupportedLifeBottomToHandEffect(effect)) {
    return executeLifeToHandMove(state, entry, effect, fromPlayerId, options);
  }
  if (isSupportedLifeTopToTrashEffect(effect)) {
    return executeLifeTopToTrashMove(
      state,
      entry,
      effect,
      fromPlayerId,
      options,
    );
  }
  if (isSupportedDeckTopToLifeTopEffect(effect)) {
    return executeDeckTopToLifeTopMove(
      state,
      entry,
      effect,
      fromPlayerId,
      player,
      options,
    );
  }
  if (isSupportedDeckTopToTrashEffect(effect)) {
    return executeDeckTopToTrashMove(
      state,
      entry,
      effect,
      fromPlayerId,
      player,
      options,
    );
  }
  if (isSupportedEffectSourceTrashToHandEffect(effect)) {
    return executeEffectSourceTrashToHandMove(
      state,
      entry,
      fromPlayerId,
      options,
    );
  }

  return toEngineResult(
    state,
    [],
    [moveCardsExecutionError(entry.effectBlockId, "unsupported-effect-shape")],
  );
};

const executeEffectSourceTrashToHandMove = (
  state: GameState,
  entry: EffectQueueEntry,
  playerId: NonNullable<ReturnType<typeof resolvePlayerId>>,
  options: { incrementStateSeq?: boolean },
): EngineResult => {
  const player = state.players[playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      [moveCardsExecutionError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }

  const trashIndex = player.trash.findIndex(
    (card) => card.instanceId === entry.source.instanceId,
  );
  const moved = player.trash[trashIndex];
  if (trashIndex < 0 || moved === undefined) {
    return toEngineResult(state, []);
  }

  const from = moved.zone;
  const to = {
    zone: "hand" as const,
    playerId,
    slot: "hand" as const,
    index: player.hand.length,
  };
  const movedCard: CardInstance = {
    ...moved,
    zone: to,
    state: "active",
    attachedDon: [],
  };
  const nextTrash = reindexZoneCards(
    player.trash.filter((card) => card.instanceId !== moved.instanceId),
    "trash",
    playerId,
    "trash",
  );
  const nextHand = addCardsToHand(player.hand, [movedCard], playerId);
  const events: EngineEvent[] = [
    {
      id: `event:${String(state.seq)}:1:cardMoved` as EngineEvent["id"],
      seq: state.eventJournal.length + 1,
      type: "cardMoved",
      payload: {
        instanceId: moved.instanceId,
        cardId: moved.cardId,
        from,
        to,
        reason: "moveCards",
      },
      visibility: { type: "public" },
      causedBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
      createdAtStateSeq: state.seq,
    },
  ];
  const shouldIncrementStateSeq = options.incrementStateSeq ?? true;

  return toEngineResult(
    {
      ...state,
      ...(shouldIncrementStateSeq ? { seq: toStateSeq(state.seq + 1) } : {}),
      players: {
        ...state.players,
        [playerId]: {
          ...player,
          hand: nextHand,
          trash: nextTrash,
        },
      },
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};

const executeDeckTopToTrashMove = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: MoveCardsEffect,
  playerId: PlayerId,
  player: NonNullable<GameState["players"][PlayerId]>,
  options: { incrementStateSeq?: boolean },
): EngineResult => {
  const movedCount = Math.min(effect.count, player.deck.length);
  if (movedCount === 0) {
    return toEngineResult(state, []);
  }
  const events: EngineEvent[] = [];
  const movedResult = moveConcreteCardsToTrash(
    state,
    events,
    player.deck.slice(0, movedCount),
    {
      cardMovedPayloadShape: "publicZoneNames",
      cardMovedVisibility: { type: "public" },
      cardTrashedVisibility: { type: "public" },
      emitCardTrashed: true,
      includeCardIdentityInCardMoved: true,
      playerId,
      reason: "moveCards",
      sourceZone: "deck",
    },
  );

  const shouldIncrementStateSeq = options.incrementStateSeq ?? true;
  return toEngineResult(
    {
      ...movedResult.state,
      ...(shouldIncrementStateSeq ? { seq: toStateSeq(state.seq + 1) } : {}),
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};

const reindexDonDeck = (
  cards: readonly CardInstance[],
  playerId: PlayerId,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId, slot: "donDeck", index },
  }));

const reindexLife = (
  cards: readonly LifeCard[],
  playerId: PlayerId,
): LifeCard[] =>
  cards.map((lifeCard, index) => ({
    ...lifeCard,
    card: {
      ...lifeCard.card,
      zone: { zone: "life", playerId, slot: "life", index },
    },
  }));

const executeLifeTopToHandMove = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: MoveCardsEffect,
  playerId: NonNullable<ReturnType<typeof resolvePlayerId>>,
  options: { incrementStateSeq?: boolean },
): EngineResult =>
  executeLifeToHandMove(state, entry, effect, playerId, options);

const lifeCardsForPosition = (
  life: readonly LifeCard[],
  count: number,
  position: "top" | "bottom",
): LifeCard[] =>
  position === "top" ? life.slice(0, count) : life.slice(-count);

const remainingLifeAfterPositionMove = (
  life: readonly LifeCard[],
  count: number,
  position: "top" | "bottom",
): LifeCard[] =>
  position === "top" ? life.slice(count) : life.slice(0, life.length - count);

const executeLifeToHandMove = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: MoveCardsEffect,
  playerId: NonNullable<ReturnType<typeof resolvePlayerId>>,
  options: { incrementStateSeq?: boolean },
): EngineResult => {
  const player = state.players[playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      [moveCardsExecutionError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }

  const position = effect.from.position;
  if (position !== "top" && position !== "bottom") {
    return toEngineResult(
      state,
      [],
      [
        moveCardsExecutionError(
          entry.effectBlockId,
          "unsupported-effect-shape",
        ),
      ],
    );
  }

  const movedCount = Math.min(effect.count, player.life.length);
  if (movedCount === 0) {
    return toEngineResult(state, []);
  }

  const movedLife = lifeCardsForPosition(player.life, movedCount, position);
  const movedCards = movedLife.map(
    (lifeCard, index): CardInstance => ({
      ...lifeCard.card,
      zone: { zone: "hand", playerId, slot: "hand", index },
    }),
  );
  const nextLife = reindexLife(
    remainingLifeAfterPositionMove(player.life, movedCount, position),
    playerId,
  );
  const nextHand = addCardsToHand(player.hand, movedCards, playerId);
  const events: EngineEvent[] = [];
  for (const [index, movedCard] of movedCards.entries()) {
    const fromIndex =
      position === "top" ? index : player.life.length - movedCount + index;
    const from = {
      zone: "life" as const,
      playerId,
      slot: "life" as const,
      index: fromIndex,
    };
    const to = {
      zone: "hand" as const,
      playerId,
      slot: "hand" as const,
      index: player.hand.length + index,
    };
    events.push({
      id: `event:${String(state.seq)}:${String(index * 2 + 1)}:cardMoved` as EngineEvent["id"],
      seq: state.eventJournal.length + events.length + 1,
      type: "cardMoved",
      payload: { from, to, reason: "moveCards" },
      visibility: { type: "public" },
      causedBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
      createdAtStateSeq: state.seq,
    });
    events.push({
      id: `event:${String(state.seq)}:${String(index * 2 + 2)}:cardMoved` as EngineEvent["id"],
      seq: state.eventJournal.length + events.length + 1,
      type: "cardMoved",
      payload: {
        instanceId: movedCard.instanceId,
        cardId: movedCard.cardId,
        from,
        to,
        reason: "moveCards",
      },
      visibility: { type: "private", playerId },
      causedBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
      createdAtStateSeq: state.seq,
    });
  }

  const shouldIncrementStateSeq = options.incrementStateSeq ?? true;
  return toEngineResult(
    {
      ...state,
      ...(shouldIncrementStateSeq ? { seq: toStateSeq(state.seq + 1) } : {}),
      players: {
        ...state.players,
        [playerId]: {
          ...player,
          hand: nextHand,
          life: nextLife,
        },
      },
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};

const executeLifeTopToTrashMove = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: MoveCardsEffect,
  playerId: NonNullable<ReturnType<typeof resolvePlayerId>>,
  options: { incrementStateSeq?: boolean },
): EngineResult => {
  const player = state.players[playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      [moveCardsExecutionError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }

  const movedCount = Math.min(effect.count, player.life.length);
  if (movedCount === 0) {
    return toEngineResult(state, []);
  }

  const events: EngineEvent[] = [];
  const movedResult = moveConcreteCardsToTrash(
    state,
    events,
    player.life.slice(0, movedCount).map((lifeCard) => lifeCard.card),
    {
      cardMovedPayloadShape: "zoneRefs",
      cardMovedVisibility: { type: "public" },
      cardTrashedVisibility: { type: "public" },
      causedBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
      emitCardTrashed: true,
      includeCardIdentityInCardMoved: true,
      playerId,
      reason: "moveCards",
      sourceZone: "life",
    },
  );

  const shouldIncrementStateSeq = options.incrementStateSeq ?? true;
  return toEngineResult(
    {
      ...movedResult.state,
      ...(shouldIncrementStateSeq ? { seq: toStateSeq(state.seq + 1) } : {}),
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};

const executeDeckTopToLifeTopMove = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: MoveCardsEffect,
  playerId: NonNullable<ReturnType<typeof resolvePlayerId>>,
  player: NonNullable<GameState["players"][PlayerId]>,
  options: { incrementStateSeq?: boolean },
): EngineResult => {
  const movedCount = Math.min(effect.count, player.deck.length);
  if (movedCount === 0) {
    return toEngineResult(state, []);
  }

  const moved = player.deck.slice(0, movedCount);
  const nextDeck = reindexZoneCards(
    player.deck.slice(movedCount),
    "deck",
    playerId,
    "deck",
  );
  const nextLife = reindexLife(
    [
      ...moved.map(
        (card, index): LifeCard => ({
          faceUp: effect.destinationFaceUp === true,
          card: {
            ...card,
            zone: { zone: "life", playerId, slot: "life", index },
          },
        }),
      ),
      ...player.life,
    ],
    playerId,
  );
  const events: EngineEvent[] = moved.map((_, index) => ({
    id: `event:${String(state.seq)}:${String(index + 1)}:cardMoved` as EngineEvent["id"],
    seq: state.eventJournal.length + index + 1,
    type: "cardMoved",
    payload: {
      from: { zone: "deck", playerId, slot: "deck", index },
      to: { zone: "life", playerId, slot: "life", index },
      reason: "moveCards",
    },
    visibility: { type: "public" },
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    createdAtStateSeq: state.seq,
  }));
  const shouldIncrementStateSeq = options.incrementStateSeq ?? true;
  return toEngineResult(
    {
      ...state,
      ...(shouldIncrementStateSeq ? { seq: toStateSeq(state.seq + 1) } : {}),
      players: {
        ...state.players,
        [playerId]: {
          ...player,
          deck: nextDeck,
          life: nextLife,
        },
      },
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};

const executeDonDeckToCostAreaMove = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: MoveCardsEffect & { destinationState: "active" | "rested" },
  playerId: NonNullable<ReturnType<typeof resolvePlayerId>>,
  options: { incrementStateSeq?: boolean },
): EngineResult => {
  const player = state.players[playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      [moveCardsExecutionError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }
  if (effect.count === 0) {
    return toEngineResult(state, []);
  }

  const movedCount = Math.min(effect.count, player.donDeck.length);
  if (movedCount === 0) {
    return toEngineResult(state, []);
  }
  const moved = player.donDeck.slice(0, movedCount);
  const nextDonDeck = reindexDonDeck(
    player.donDeck.slice(movedCount),
    playerId,
  );
  const destinationState = effect.destinationState;
  const nextCostArea = [
    ...player.costArea,
    ...moved.map(
      (card, index): CardInstance => ({
        ...card,
        zone: {
          zone: "costArea",
          playerId,
          slot: "cost",
          index: player.costArea.length + index,
        },
        state: destinationState,
      }),
    ),
  ];
  const events: EngineEvent[] = moved.map((card, index) => ({
    id: `event:${String(state.seq)}:${String(index + 1)}:cardMoved` as EngineEvent["id"],
    seq: state.eventJournal.length + index + 1,
    type: "cardMoved",
    payload: {
      playerId,
      cardInstanceId: card.instanceId,
      from: "donDeck",
      to: "costArea",
    },
    visibility: { type: "replayOnly" },
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    createdAtStateSeq: state.seq,
  }));
  const shouldIncrementStateSeq = options.incrementStateSeq ?? true;
  return toEngineResult(
    {
      ...state,
      ...(shouldIncrementStateSeq ? { seq: toStateSeq(state.seq + 1) } : {}),
      players: {
        ...state.players,
        [playerId]: {
          ...player,
          donDeck: nextDonDeck,
          costArea: nextCostArea,
        },
      },
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};
