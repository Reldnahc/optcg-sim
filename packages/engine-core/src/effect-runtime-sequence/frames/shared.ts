import type {
  EffectExecutionFrame,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import { findSequenceFrameByDecisionId } from "../frame-decisions.js";
import { findFrameQueueEntry, findSequenceEffectBlock } from "../resume.js";
import {
  emptySegmentResult,
  segmentKey,
  sequenceRuntimeError,
} from "../runner.js";
import {
  toSupportedSequenceBlock,
  type SupportedSequenceBlock,
} from "../support.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SequenceFrameResumeResult,
  SegmentLedgers,
} from "./types.js";

export { emptySegmentResult, segmentKey, sequenceRuntimeError };
export { findFrameQueueEntry, findSequenceEffectBlock };

export const createUnsupportedTrashDecision: CreateTrashFromHandSequenceDecision =
  (state, entry) => ({
    error: sequenceRuntimeError(
      entry.effectBlockId,
      "unsupported-sequence-shape",
    ),
    events: [],
    ok: false,
    state,
  });

export const toResumeLedgers = (
  frame: EffectExecutionFrame,
): SegmentLedgers => ({
  savedReferences: frame.savedReferences,
  segmentResults: frame.segmentResults,
});

type SupportedFrameContext =
  | {
      entry: EffectQueueEntry;
      frame: EffectExecutionFrame;
      ok: true;
      supportedBlock: SupportedSequenceBlock;
    }
  | {
      ok: false;
      result: Exclude<SequenceFrameResumeResult, undefined>;
    }
  | { ok: false; result: undefined };

export const getSupportedFrameContext = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
): SupportedFrameContext => {
  const frame = findSequenceFrameByDecisionId(state, decisionId);
  if (frame === undefined) {
    return { ok: false, result: undefined };
  }
  const entry = findFrameQueueEntry(state, frame);
  if (entry === undefined) {
    return {
      ok: false,
      result: {
        error: sequenceRuntimeError(frame.effectBlockId, "missing-queue-entry"),
        ok: false,
      },
    };
  }
  const supportedBlock = toSupportedSequenceBlock(
    entry,
    findSequenceEffectBlock(state, entry),
  );
  if (supportedBlock === undefined) {
    return {
      ok: false,
      result: {
        error: sequenceRuntimeError(
          entry.effectBlockId,
          "missing-effect-block",
        ),
        ok: false,
      },
    };
  }
  return { entry, frame, ok: true, supportedBlock };
};
