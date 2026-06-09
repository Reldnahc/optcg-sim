import type { CardRef, Effect, GameState } from "@optcg/types";

import { findSequenceFrameByDecisionId } from "./frame-decisions.js";
import {
  findFrameQueueEntry,
  findSequenceEffectBlock,
  resumeSequenceFrameFromLedgers,
} from "./resume.js";
import { emptySegmentResult, sequenceRuntimeError } from "./runner.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SequenceFrameResumeResult,
} from "./runner.js";
import { resolveSequenceForPath, segmentKeyForPath } from "./paths.js";
import { applySelectedReturnDonSegment } from "./segments.js";
import {
  toSupportedSequenceBlock,
  type SupportedSequenceSegment,
} from "./support.js";

type ReturnDonEffect = Extract<Effect, { type: "returnDon" }>;

export const resumeSequenceFrameAfterReturnDonBody = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
  playerId: NonNullable<GameState["pendingDecision"]>["playerId"],
  selectedDonIds: readonly CardRef["instanceId"][],
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
  const sequence = resolveSequenceForPath(
    supportedBlock.effect,
    frame.effectPath,
  );
  const pausedSegment =
    sequence?.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    pausedSegment.effect.type !== "returnDon"
  ) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const resolved = applySelectedReturnDonSegment(
    state,
    playerId,
    pausedSegment as SupportedSequenceSegment & { effect: ReturnDonEffect },
    frame.pendingDecision.resumeAtSegmentIndex,
    selectedDonIds,
    {
      savedReferences: frame.savedReferences,
      segmentResults: frame.segmentResults,
    },
    emptySegmentResult,
    (segment, index) => segmentKeyForPath(frame.effectPath, segment, index),
  );
  if (!resolved.ok) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }
  const resumed = resumeSequenceFrameFromLedgers({
    createTrashDecision,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: resolved.ledgers,
    state: resolved.state,
  });
  if (resumed === undefined || !resumed.ok) {
    return resumed;
  }
  return {
    ...resumed,
    events: [...resolved.events, ...resumed.events],
  };
};
