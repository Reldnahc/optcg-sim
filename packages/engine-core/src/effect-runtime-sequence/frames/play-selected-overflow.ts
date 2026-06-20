import type { GameState, SelectCardsDecision } from "@optcg/types";

import { resumePlaySelectedOverflowFrame } from "../../runtime/primitives/play-selected.js";
import { resumeSequenceFrameFromLedgers } from "../resume.js";
import {
  createUnsupportedTrashDecision,
  emptySegmentResult,
  getSupportedFrameContext,
  sequenceRuntimeError,
} from "./shared.js";
import { segmentKeyForPath } from "../paths.js";
import type { SequenceFrameResumeResult } from "./types.js";

export const resumeSequenceFrameAfterPlaySelectedOverflow = (
  state: GameState,
  decisionId: SelectCardsDecision["id"],
): SequenceFrameResumeResult => {
  const context = getSupportedFrameContext(state, decisionId);
  if (!context.ok) {
    return context.result;
  }
  return resumePlaySelectedOverflowFrame({
    createUnsupportedTrashDecision,
    effectBlock: context.supportedBlock,
    emptySegmentResult,
    entry: context.entry,
    frame: context.frame,
    resumeSequenceFrameFromLedgers,
    segmentKey: (segment, index) =>
      segmentKeyForPath(context.frame.effectPath, segment, index),
    sequenceRuntimeError,
    state,
  });
};
