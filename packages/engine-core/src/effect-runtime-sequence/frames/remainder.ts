import type { GameState } from "@optcg/types";

import { resumeSequenceFrameFromLedgers } from "../resume.js";
import { resolveSequenceForPath, segmentKeyForPath } from "../paths.js";
import {
  emptySegmentResult,
  getSupportedFrameContext,
  sequenceRuntimeError,
} from "./shared.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SequenceFrameResumeResult,
} from "./types.js";

export const resumeSequenceFrameAfterPlaceSetRemainder = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameResumeResult => {
  const context = getSupportedFrameContext(state, decisionId);
  if (!context.ok) {
    return context.result;
  }
  const { entry, frame, supportedBlock } = context;
  const index = frame.pendingDecision.resumeAtSegmentIndex;
  const pausedSequence = resolveSequenceForPath(
    supportedBlock.effect,
    frame.effectPath,
  );
  const pausedSegment = pausedSequence?.effects[index];
  if (
    pausedSegment === undefined ||
    pausedSegment.effect.type !== "placeSetRemainder"
  ) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const resultKey = segmentKeyForPath(frame.effectPath, pausedSegment, index);
  const previousResult = frame.segmentResults[resultKey];
  return resumeSequenceFrameFromLedgers({
    createTrashDecision,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: {
      savedReferences: frame.savedReferences,
      segmentResults: {
        ...frame.segmentResults,
        [resultKey]: {
          ...emptySegmentResult(),
          ...previousResult,
          attempted: true,
          succeeded: true,
          changedState: true,
        },
      },
    },
    state,
  });
};
