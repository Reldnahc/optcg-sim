import type { Action, EngineResult, GameState } from "@optcg/types";

import { finalizeBattleAfterReplacementResolution } from "../battle/actions.js";
import { finalizeSelectedTargetEffectResolution } from "../effect-runtime.js";
import { applyReplacementPayCostDecisionResponse } from "./pay-cost-actions.js";
import { applyReplacementRestTargetDecisionResponse } from "./rest-target-decision.js";
import { applyReplacementTrashFromHandDecisionResponse } from "./trash-from-hand-actions.js";
import { toEngineResult } from "../action-results.js";
import { resumeSequenceFrameAfterReplacement } from "../effect-runtime-sequence/frames.js";

const queueEntryIdFromReplacementPayload = (
  payload: unknown,
): string | undefined => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "queueEntryId" in payload &&
    typeof payload.queueEntryId === "string"
  ) {
    return payload.queueEntryId;
  }
  return undefined;
};

const hasBattleKoReplacementContinuation = (payload: unknown): boolean => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("battleContinuation" in payload)
  ) {
    return false;
  }
  const continuation = payload.battleContinuation;
  return (
    typeof continuation === "object" &&
    continuation !== null &&
    "type" in continuation &&
    continuation.type === "endBattleAfterCharacterKoAttempt"
  );
};

export const applyReplacementRestTargetDecisionWithContinuation = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const replacementRestTargetResult =
    applyReplacementRestTargetDecisionResponse(state, action) ??
    applyReplacementTrashFromHandDecisionResponse(state, action) ??
    applyReplacementPayCostDecisionResponse(state, action);
  if (replacementRestTargetResult === null) {
    return null;
  }
  const result = replacementRestTargetResult.result;
  if (result.errors !== undefined) {
    return result;
  }
  const completedPayload = replacementRestTargetResult.completedPayload;
  const queuedEntryId = queueEntryIdFromReplacementPayload(completedPayload);
  const frameFromQueueEntry =
    queuedEntryId === undefined
      ? undefined
      : (result.state.effectExecutionFrames.find(
          (frame) => frame.queueEntryId === queuedEntryId,
        ) ??
        state.effectExecutionFrames.find(
          (frame) => frame.queueEntryId === queuedEntryId,
        ));
  const pausedFrame =
    frameFromQueueEntry ??
    (state.effectExecutionFrames.length === 1
      ? state.effectExecutionFrames[0]
      : undefined);
  const queuedEntryIdFromFrame = pausedFrame?.queueEntryId;
  const queuedEntry =
    queuedEntryIdFromFrame === undefined
      ? undefined
      : state.effectQueue.find((entry) => entry.id === queuedEntryIdFromFrame);
  const nextState: GameState = {
    ...result.state,
    actionSeq: state.actionSeq + 1,
  };
  if (hasBattleKoReplacementContinuation(completedPayload)) {
    return finalizeBattleAfterReplacementResolution(
      state,
      nextState,
      result.events,
    );
  }
  if (queuedEntry !== undefined && pausedFrame !== undefined) {
    const resumeState = nextState.effectExecutionFrames.some(
      (frame) =>
        frame.pendingDecision.decisionId ===
        pausedFrame.pendingDecision.decisionId,
    )
      ? nextState
      : {
          ...nextState,
          effectExecutionFrames: [
            ...nextState.effectExecutionFrames,
            pausedFrame,
          ],
        };
    const resumed = resumeSequenceFrameAfterReplacement(
      resumeState,
      pausedFrame.pendingDecision.decisionId,
    );
    if (resumed !== undefined) {
      if (!resumed.ok) {
        return toEngineResult(state, [], [resumed.error]);
      }
      return toEngineResult(resumed.state, [
        ...result.events,
        ...resumed.events,
      ]);
    }
  }
  return queuedEntry === undefined
    ? toEngineResult(nextState, result.events)
    : finalizeSelectedTargetEffectResolution(
        nextState,
        state,
        queuedEntry,
        result.events,
        result.events.slice(1),
      );
};
