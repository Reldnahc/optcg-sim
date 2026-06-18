import type {
  Effect,
  EffectQueueEntry,
  EngineError,
  EngineResult,
  GameState,
} from "@optcg/types";

import { toEngineResult, toStateSeq } from "../../action-results.js";
import { resolvePlayerId } from "./draw.js";

type TakeExtraTurnEffect = Extract<Effect, { type: "takeExtraTurn" }>;

const takeExtraTurnError = (effectId: string, reason: string): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason },
});

export const isSupportedTakeExtraTurnBody = (
  effect: Effect,
): effect is TakeExtraTurnEffect =>
  effect.type === "takeExtraTurn" &&
  (effect.player === "self" || effect.player === "opponent");

export const applyTakeExtraTurnStateChange = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
): GameState => ({
  ...state,
  seq: toStateSeq(state.seq + 1),
  turn: {
    ...state.turn,
    extraTurnPlayerIds: [...(state.turn.extraTurnPlayerIds ?? []), playerId],
  },
});

export const executeTakeExtraTurnPrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
): EngineResult => {
  if (!isSupportedTakeExtraTurnBody(effect)) {
    return toEngineResult(
      state,
      [],
      [takeExtraTurnError(entry.effectBlockId, "unsupported-effect-shape")],
    );
  }
  const playerId = resolvePlayerId(state, entry, effect.player);
  if (playerId === undefined || state.players[playerId] === undefined) {
    return toEngineResult(
      state,
      [],
      [takeExtraTurnError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }
  return toEngineResult(applyTakeExtraTurnStateChange(state, playerId), []);
};
