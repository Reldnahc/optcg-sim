import type { EngineEvent, GameState } from "@optcg/types";

import { resumeSequenceFrameFromLedgers } from "../resume.js";
import {
  createUnsupportedTrashDecision,
  getSupportedFrameContext,
  sequenceRuntimeError,
  toResumeLedgers,
} from "./shared.js";
import type { SequenceFrameResumeResult } from "./types.js";

export const resumeSequenceFrameAfterLifeTriggerDecision = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
  completedSegmentEvents: readonly EngineEvent[] = [],
): SequenceFrameResumeResult => {
  const context = getSupportedFrameContext(state, decisionId);
  if (!context.ok) {
    return context.result;
  }
  const { entry, frame, supportedBlock } = context;
  const pausedSegment =
    supportedBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (pausedSegment?.effect.type !== "damage") {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  return resumeSequenceFrameFromLedgers({
    createTrashDecision: createUnsupportedTrashDecision,
    completedSegmentEvents,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: toResumeLedgers(frame),
    state,
  });
};
