import type {
  EffectExecutionFrame,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import { resumeSequenceFrameAfterChooseQuantity as resumeDrawUpToQuantitySequenceFrame } from "../draw-upto.js";
import { resolveSequenceForPath, segmentKeyForPath } from "../runner.js";
import { resumeSequenceFrameFromLedgers } from "../resume.js";
import { type SupportedSequenceBlock } from "../support.js";
import {
  emptySegmentResult,
  findFrameQueueEntry,
  findSequenceEffectBlock,
  sequenceRuntimeError,
} from "./shared.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SegmentLedgers,
  SequenceFrameResumeResult,
} from "./types.js";

export const resumeSequenceFrameAfterChooseQuantity = (
  state: GameState,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameResumeResult => {
  return resumeDrawUpToQuantitySequenceFrame({
    emptySegmentResult,
    findFrameQueueEntry,
    findSequenceEffectBlock,
    resumeSequenceFrameFromLedgers: (params) =>
      resumeSequenceFrameFromLedgers(
        params as {
          createTrashDecision: CreateTrashFromHandSequenceDecision;
          effectBlock: SupportedSequenceBlock;
          entry: EffectQueueEntry;
          finalizeCompleted: boolean;
          frame: EffectExecutionFrame;
          ledgers: SegmentLedgers;
          state: GameState;
        },
      ),
    resolveSequenceForFrame: (effect, frame) =>
      resolveSequenceForPath(effect, frame.effectPath),
    segmentKey: (frame, segment, index) =>
      segmentKeyForPath(frame.effectPath, segment, index),
    sequenceRuntimeError,
    state,
    createTrashDecision,
  });
};
