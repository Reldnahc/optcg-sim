import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import { toEngineResult, toStateSeq } from "./action-results.js";
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
      insertPosition: "bottom",
      playerId: fromPlayerId,
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
