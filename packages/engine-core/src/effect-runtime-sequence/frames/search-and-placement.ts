import type {
  EffectExecutionFrame,
  EffectQueueEntry,
  GameState,
  SelectCardsDecision,
} from "@optcg/types";

import {
  resumeSequenceFrameAfterSearchRevealHelper,
  retargetSequenceFrameAfterSearchRevealOrder,
} from "../search-reveal.js";
import { resumeSequenceFrameFromLedgers } from "../resume.js";
import {
  toSupportedSequenceBlock,
  type SupportedSequenceBlock,
} from "../support.js";
import {
  emptySegmentResult,
  getSupportedFrameContext,
  segmentKey,
  sequenceRuntimeError,
  findFrameQueueEntry,
  findSequenceEffectBlock,
} from "./shared.js";
import type {
  CreateTrashFromHandSequenceDecision,
  ResumeSelectedCards,
  SegmentLedgers,
  SequenceFrameResumeResult,
} from "./types.js";

export { retargetSequenceFrameAfterSearchRevealOrder };

const resumeFromLedgers = (params: {
  createTrashDecision: unknown;
  effectBlock: SupportedSequenceBlock;
  entry: EffectQueueEntry;
  finalizeCompleted: boolean;
  frame: EffectExecutionFrame;
  ledgers: SegmentLedgers;
  state: GameState;
}) =>
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
  );

export const resumeSequenceFrameAfterSearchReveal = (
  state: GameState,
  decisionId: SelectCardsDecision["id"],
  selectedCards: ResumeSelectedCards,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameResumeResult =>
  resumeSequenceFrameAfterSearchRevealHelper({
    createTrashDecision,
    decisionId,
    emptySegmentResult,
    findFrameQueueEntry,
    findSequenceEffectBlock,
    toSupportedSequenceBlock,
    resumeSequenceFrameFromLedgers: resumeFromLedgers,
    segmentKey,
    selectedCards,
    sequenceRuntimeError,
    state,
  });

export const resumeSequenceFrameAfterTopDeckPlacement = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameResumeResult => {
  const context = getSupportedFrameContext(state, decisionId);
  if (!context.ok) {
    return context.result;
  }
  const { entry, frame, supportedBlock } = context;
  const pausedSegment =
    supportedBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    pausedSegment.effect.type !== "placeTopDeckCards"
  ) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
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
        [segmentKey(pausedSegment, frame.pendingDecision.resumeAtSegmentIndex)]:
          {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: true,
          },
      },
    },
    state,
  });
};
