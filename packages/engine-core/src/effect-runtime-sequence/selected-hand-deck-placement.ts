import type { GameState } from "@optcg/types";

import { findSequenceFrameByDecisionId } from "./frame-decisions.js";
import {
  emptySegmentResult,
  sequenceRuntimeError,
  type CreateTrashFromHandSequenceDecision,
  type SequenceFrameResumeResult,
} from "./runner.js";
import { resolveSequenceForPath, segmentKeyForPath } from "./paths.js";
import {
  findFrameQueueEntry,
  findSequenceEffectBlock,
  resumeSequenceFrameFromLedgers,
} from "./resume.js";
import { toSupportedSequenceBlock } from "./support.js";

export const resumeSequenceFrameAfterSelectedHandDeckPlacement = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameResumeResult => {
  const frame = findSequenceFrameByDecisionId(state, decisionId);
  if (frame === undefined) {
    return undefined;
  }
  const entry = findFrameQueueEntry(state, frame);
  if (entry === undefined) {
    return {
      error: sequenceRuntimeError(frame.effectBlockId, "missing-queue-entry"),
      ok: false,
    };
  }
  const effectBlock = findSequenceEffectBlock(state, entry);
  const supportedBlock = toSupportedSequenceBlock(entry, effectBlock);
  if (supportedBlock === undefined) {
    return {
      error: sequenceRuntimeError(entry.effectBlockId, "missing-effect-block"),
      ok: false,
    };
  }
  const pausedSequence = resolveSequenceForPath(
    supportedBlock.effect,
    frame.effectPath,
  );
  const pausedSegment =
    pausedSequence?.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    pausedSegment.effect.type !== "moveSelected" ||
    pausedSegment.effect.from !== "hand" ||
    pausedSegment.effect.to !== "deck" ||
    pausedSegment.effect.position !== "topOrBottom"
  ) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const resultKey = segmentKeyForPath(
    frame.effectPath,
    pausedSegment,
    frame.pendingDecision.resumeAtSegmentIndex,
  );
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
          attempted: true,
          succeeded: true,
          changedState: true,
          selectedCards: frame.segmentResults[resultKey]?.selectedCards ?? [],
        },
      },
    },
    state,
  });
};
