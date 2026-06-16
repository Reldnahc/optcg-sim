import type { EngineEvent, GameState } from "@optcg/types";

import { resolveSequenceForPath, segmentKeyForPath } from "../paths.js";
import { resumeSequenceFrameFromLedgers } from "../resume.js";
import {
  createUnsupportedTrashDecision,
  emptySegmentResult,
  getSupportedFrameContext,
  sequenceRuntimeError,
} from "./shared.js";
import type { SequenceFrameResumeResult } from "./types.js";

export const resumeSequenceFrameAfterReplacement = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
  completedSegmentEvents: readonly EngineEvent[] = [],
): SequenceFrameResumeResult => {
  const context = getSupportedFrameContext(state, decisionId);
  if (!context.ok) {
    return context.result;
  }
  const { entry, frame, supportedBlock } = context;
  const sequence = resolveSequenceForPath(
    supportedBlock.effect,
    frame.effectPath,
  );
  const pausedSegment =
    sequence?.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    (pausedSegment.effect.type !== "ko" &&
      pausedSegment.effect.type !== "bounce")
  ) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const pausedSegmentKey = segmentKeyForPath(
    frame.effectPath,
    pausedSegment,
    frame.pendingDecision.resumeAtSegmentIndex,
  );
  return resumeSequenceFrameFromLedgers({
    createTrashDecision: createUnsupportedTrashDecision,
    completedSegmentEvents,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: {
      savedReferences: frame.savedReferences,
      segmentResults: {
        ...frame.segmentResults,
        [pausedSegmentKey]: {
          ...emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: true,
          selectedTargets:
            frame.segmentResults[pausedSegmentKey]?.selectedTargets ?? [],
        },
      },
    },
    state,
  });
};
