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

import { toEngineResult, toStateSeq } from "./action-results.js";
import { reindexZoneCards } from "./action-state.js";
import { moveConcreteCardsToTrash } from "./concrete-card-movement.js";
import { resolvePlayerId } from "./effect-runtime-primitives.js";

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
  effect.from.player === "self" &&
  effect.from.zone === "donDeck" &&
  effect.from.position === "top" &&
  effect.to.player === "self" &&
  effect.to.zone === "costArea" &&
  effect.to.position === undefined &&
  (effect.destinationState === "active" ||
    effect.destinationState === "rested");

export const isSupportedLifeTopToHandEffect = (
  effect: Effect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" &&
  Number.isInteger(effect.count) &&
  effect.count > 0 &&
  effect.from.player === "self" &&
  effect.from.zone === "life" &&
  effect.from.position === "top" &&
  effect.to.player === "self" &&
  effect.to.zone === "hand" &&
  effect.to.position === undefined;

export const isSupportedMoveCardsEffect = (
  effect: Effect,
): effect is MoveCardsEffect =>
  isSupportedDeckTopToTrashEffect(effect) ||
  isSupportedDonDeckToCostAreaEffect(effect) ||
  isSupportedLifeTopToHandEffect(effect);

export const isSupportedMoveCardsEffectBlock = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: MoveCardsEffect;
} =>
  effect.category === "auto" &&
  effect.optional !== true &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  isSupportedMoveCardsEffect(effect.effect);

export const resolveSupportedQueuedMoveCardsEffect = (
  effect: EffectDefinition["effects"][number] | undefined,
  entry: EffectQueueEntry,
): MoveCardsEffect | undefined =>
  effect !== undefined &&
  effect.sourcePresencePolicy === entry.sourcePresencePolicy &&
  isSupportedMoveCardsEffectBlock(effect)
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
  const toPlayerId = resolvePlayerId(state, entry, effect.to.player);
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

  return toEngineResult(
    state,
    [],
    [moveCardsExecutionError(entry.effectBlockId, "unsupported-effect-shape")],
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

  const movedCards = player.life.slice(0, movedCount).map(
    (lifeCard, index): CardInstance => ({
      ...lifeCard.card,
      zone: { zone: "hand", playerId, slot: "hand", index },
    }),
  );
  const nextLife = reindexLife(player.life.slice(movedCount), playerId);
  const nextHand = reindexZoneCards(
    [...movedCards, ...player.hand],
    "hand",
    playerId,
    "hand",
  );
  const events: EngineEvent[] = [];
  for (const [index, movedCard] of movedCards.entries()) {
    const from = {
      zone: "life" as const,
      playerId,
      slot: "life" as const,
      index,
    };
    const to = {
      zone: "hand" as const,
      playerId,
      slot: "hand" as const,
      index,
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
