import type {
  CardRef,
  EffectExecutionFrame,
  GameState,
  SelectCardsDecision,
  SelectTargetsDecision,
} from "@optcg/types";

import {
  resumeSequenceFrameAfterHandSelection as resumeSequenceFrameAfterHandSelectionHelper,
  resumeSequenceFrameAfterTrashFromHand as resumeSequenceFrameAfterTrashFromHandHelper,
} from "../select-cards.js";
import { resumeSequenceFrameAfterSelectTargets as resumeSequenceFrameAfterSelectTargetsHelper } from "../select-targets.js";
import { resumeSequenceFrameFromLedgers } from "../resume.js";
import type { SupportedSequenceBlock } from "../support.js";
import {
  createUnsupportedTrashDecision,
  emptySegmentResult,
  findFrameQueueEntry,
  findSequenceEffectBlock,
  segmentKey,
  sequenceRuntimeError,
} from "./shared.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SegmentLedgers,
  SequenceFrameResumeResult,
} from "./types.js";

const resumeFromLedgers = (params: {
  createTrashDecision: unknown;
  effectBlock: unknown;
  entry: Parameters<typeof resumeSequenceFrameFromLedgers>[0]["entry"];
  finalizeCompleted: boolean;
  frame: EffectExecutionFrame;
  ledgers: SegmentLedgers;
  state: GameState;
}) =>
  resumeSequenceFrameFromLedgers(
    params as {
      createTrashDecision: CreateTrashFromHandSequenceDecision;
      effectBlock: SupportedSequenceBlock;
      entry: Parameters<typeof resumeSequenceFrameFromLedgers>[0]["entry"];
      finalizeCompleted: boolean;
      frame: EffectExecutionFrame;
      ledgers: SegmentLedgers;
      state: GameState;
    },
  );

export const resumeSequenceFrameAfterTrashFromHand = (
  state: GameState,
  decision: SelectCardsDecision,
  selectedCards: readonly CardRef[],
): SequenceFrameResumeResult => {
  return resumeSequenceFrameAfterTrashFromHandHelper({
    createUnsupportedTrashDecision,
    decision,
    emptySegmentResult,
    findFrameQueueEntry,
    findSequenceEffectBlock,
    resumeSequenceFrameFromLedgers: resumeFromLedgers,
    segmentKey,
    selectedCards,
    sequenceRuntimeError,
    state,
  });
};

export const resumeSequenceFrameAfterHandSelection = (
  state: GameState,
  decision: SelectCardsDecision,
  selectedCards: readonly CardRef[],
): SequenceFrameResumeResult => {
  return resumeSequenceFrameAfterHandSelectionHelper({
    createUnsupportedTrashDecision,
    decision,
    emptySegmentResult,
    findFrameQueueEntry,
    findSequenceEffectBlock,
    resumeSequenceFrameFromLedgers: resumeFromLedgers,
    segmentKey,
    selectedCards,
    sequenceRuntimeError,
    state,
  });
};

export const resumeSequenceFrameAfterSelectTargets = (
  state: GameState,
  decision: SelectTargetsDecision,
  selectedTargets: readonly CardRef[],
): SequenceFrameResumeResult => {
  return resumeSequenceFrameAfterSelectTargetsHelper({
    createUnsupportedTrashDecision,
    decision,
    emptySegmentResult,
    findFrameQueueEntry,
    findSequenceEffectBlock,
    resumeSequenceFrameFromLedgers: resumeFromLedgers,
    segmentKey,
    selectedTargets,
    sequenceRuntimeError,
    state,
  });
};
