import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  appendEvent,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { resolvePlayerId } from "./draw.js";

type WinGameExecutionFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-player-ref";

interface WinGameExecutionErrorDetails {
  reason: WinGameExecutionFailureReason;
}

const winGameExecutionError = (
  effectId: string,
  reason: WinGameExecutionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies WinGameExecutionErrorDetails,
});

export const isSupportedWinGameBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "winGame" }> =>
  effect.type === "winGame" && effect.player === "self";

export const isSupportedQueuedWinGameEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "winGame" }>;
} =>
  effect.category === "auto" &&
  effect.optional !== true &&
  effect.oncePerTurn !== true &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  isSupportedWinGameBody(effect.effect);

export const executeWinGamePrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Extract<Effect, { type: "winGame" }>,
): EngineResult => {
  const winner = resolvePlayerId(state, entry, effect.player);
  if (winner === undefined || state.players[winner] === undefined) {
    return toEngineResult(
      state,
      [],
      [winGameExecutionError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "gameEnded",
    { reason: "effect", winner, effectBlockId: entry.effectBlockId },
    { type: "public" },
  );
  const ended = events[0];
  if (ended !== undefined) {
    ended.causedBy = {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    };
  }

  return toEngineResult(
    {
      ...state,
      seq: toStateSeq(state.seq + 1),
      status: { type: "completed", winner },
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};

export const executeNoChoiceWinGamePrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
): EngineResult =>
  effect.type === "winGame"
    ? executeWinGamePrimitive(state, entry, effect)
    : toEngineResult(
        state,
        [],
        [
          winGameExecutionError(
            entry.effectBlockId,
            "unsupported-effect-shape",
          ),
        ],
      );
