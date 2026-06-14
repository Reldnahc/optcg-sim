import type { EffectQueueEntry, GameState } from "@optcg/types";

export type DecisionQueueEntryLookup =
  | { readonly ok: true; readonly entry: EffectQueueEntry }
  | {
      readonly ok: false;
      readonly reason: "not-effect-decision" | "stale-effect-decision";
    };

export const effectQueueEntryForDecision = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]>,
): DecisionQueueEntryLookup => {
  if (decision.causedBy.type !== "effect") {
    return { ok: false, reason: "not-effect-decision" };
  }
  const entry = state.effectQueue.find(
    (candidate) =>
      candidate.id === decision.causedBy.queueEntryId &&
      candidate.effectBlockId === decision.causedBy.effectId,
  );
  return entry === undefined
    ? { ok: false, reason: "stale-effect-decision" }
    : { ok: true, entry };
};

export const clearPendingDecision = (state: GameState): GameState => {
  const nextState: GameState = { ...state };
  delete nextState.pendingDecision;
  return nextState;
};
