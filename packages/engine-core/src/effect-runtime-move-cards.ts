import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { reindexZoneCards } from "./action-state.js";
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

export const isSupportedDeckTopToTrashEffectBlock = (
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
  isSupportedDeckTopToTrashEffect(effect.effect);

export const resolveSupportedQueuedMoveCardsEffect = (
  effect: EffectDefinition["effects"][number] | undefined,
  entry: EffectQueueEntry,
): MoveCardsEffect | undefined =>
  effect !== undefined &&
  effect.sourcePresencePolicy === entry.sourcePresencePolicy &&
  isSupportedDeckTopToTrashEffectBlock(effect)
    ? effect.effect
    : undefined;

const moveTopDeckCardsToTrash = (
  player: NonNullable<GameState["players"][PlayerId]>,
  playerId: PlayerId,
  count: number,
): {
  moved: CardInstance[];
  player: NonNullable<GameState["players"][PlayerId]>;
} => {
  const moved = player.deck.slice(0, count).map((card, index) => ({
    ...card,
    zone: {
      zone: "trash" as const,
      playerId,
      slot: "trash" as const,
      index: player.trash.length + index,
    },
  }));
  return {
    moved,
    player: {
      ...player,
      deck: reindexZoneCards(
        player.deck.slice(count),
        "deck",
        playerId,
        "deck",
      ),
      trash: reindexZoneCards(
        [...player.trash, ...moved],
        "trash",
        playerId,
        "trash",
      ),
    },
  };
};

export const executeMoveCardsPrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
  options: { incrementStateSeq?: boolean } = {},
): EngineResult => {
  if (!isSupportedDeckTopToTrashEffect(effect)) {
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

  const movedCount = Math.min(effect.count, player.deck.length);
  if (movedCount === 0) {
    return toEngineResult(state, []);
  }
  const movedResult = moveTopDeckCardsToTrash(player, fromPlayerId, movedCount);
  const events: EngineEvent[] = [];
  for (const moved of movedResult.moved) {
    appendEvent(
      state,
      events,
      "cardMoved",
      {
        from: "deck",
        to: "trash",
        playerId: fromPlayerId,
        reason: "moveCards",
        instanceId: moved.instanceId,
        cardId: moved.cardId,
      },
      { type: "public" },
    );
    appendEvent(
      state,
      events,
      "cardTrashed",
      {
        playerId: fromPlayerId,
        instanceId: moved.instanceId,
        cardId: moved.cardId,
        reason: "moveCards",
      },
      { type: "public" },
    );
  }

  const shouldIncrementStateSeq = options.incrementStateSeq ?? true;
  return toEngineResult(
    {
      ...state,
      ...(shouldIncrementStateSeq ? { seq: toStateSeq(state.seq + 1) } : {}),
      players: {
        ...state.players,
        [fromPlayerId]: movedResult.player,
      },
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};
