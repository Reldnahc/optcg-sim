import type {
  Effect,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import {
  applyResolvedQuantityDrawSegment,
  applyResolvedQuantityMoveCardsSegment,
  applyResolvedQuantityRevealTopSegment,
} from "./effect-runtime-sequence-segments.js";
import { toSupportedSequenceBlock } from "./effect-runtime-sequence-support.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type DrawUpToEffect = Extract<Effect, { type: "drawUpTo" }>;
type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
type RevealTopEffect = Extract<Effect, { type: "revealTop" }>;

type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

type SequenceFrameResumeResult =
  | {
      events: EngineEvent[];
      ok: true;
      state: GameState;
    }
  | {
      error: EngineError;
      ok: false;
    }
  | undefined;

export const resumeSequenceFrameAfterChooseQuantity = (params: {
  emptySegmentResult: () => SequenceSegmentResult;
  findFrameQueueEntry: (
    state: GameState,
    frame: EffectExecutionFrame,
  ) => EffectQueueEntry | undefined;
  findSequenceEffectBlock: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => EffectDefinition["effects"][number] | undefined;
  resumeSequenceFrameFromLedgers: (params: {
    createTrashDecision: unknown;
    effectBlock: unknown;
    entry: EffectQueueEntry;
    finalizeCompleted: boolean;
    frame: EffectExecutionFrame;
    ledgers: SegmentLedgers;
    state: GameState;
  }) => SequenceFrameResumeResult;
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  sequenceRuntimeError: (
    effectId: EffectQueueEntry["effectBlockId"],
    reason:
      | "missing-frame"
      | "missing-queue-entry"
      | "missing-effect-block"
      | "unsupported-sequence-shape"
      | "segment-execution-failed",
  ) => EngineError;
  state: GameState;
  unsupportedTrashDecision: unknown;
}): SequenceFrameResumeResult => {
  const latestResolved = [...params.state.eventJournal]
    .reverse()
    .find((event) => event.type === "decisionResolved");
  if (latestResolved === undefined) {
    return undefined;
  }
  const payload =
    typeof latestResolved.payload === "object" &&
    latestResolved.payload !== null
      ? (latestResolved.payload as Record<string, unknown>)
      : undefined;
  if (payload === undefined) {
    return undefined;
  }
  const decisionId = payload["decisionId"];
  const decisionType = payload["decisionType"];
  const responseType = payload["responseType"];
  const quantity = payload["quantity"];
  if (
    typeof decisionId !== "string" ||
    decisionType !== "chooseQuantity" ||
    responseType !== "chooseQuantity" ||
    typeof quantity !== "number" ||
    !Number.isInteger(quantity)
  ) {
    return undefined;
  }
  const frame = params.state.effectExecutionFrames.find(
    (candidate) => candidate.pendingDecision.decisionId === decisionId,
  );
  if (frame === undefined) {
    return undefined;
  }
  const entry = params.findFrameQueueEntry(params.state, frame);
  if (entry === undefined) {
    return {
      error: params.sequenceRuntimeError(
        frame.effectBlockId,
        "missing-queue-entry",
      ),
      ok: false,
    };
  }
  const effectBlock = params.findSequenceEffectBlock(params.state, entry);
  const supportedBlock = toSupportedSequenceBlock(entry, effectBlock);
  if (supportedBlock === undefined) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "missing-effect-block",
      ),
      ok: false,
    };
  }
  const pausedSegment =
    supportedBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    (pausedSegment.effect.type !== "drawUpTo" &&
      pausedSegment.effect.type !== "moveCards" &&
      pausedSegment.effect.type !== "revealTop")
  ) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  if (quantity < 0 || quantity > pausedSegment.effect.count) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }
  const ledgers = {
    savedReferences: frame.savedReferences,
    segmentResults: frame.segmentResults,
  };
  const resolved =
    pausedSegment.effect.type === "drawUpTo"
      ? applyResolvedQuantityDrawSegment(
          params.state,
          entry,
          pausedSegment as SequenceEffect["effects"][number] & {
            effect: DrawUpToEffect;
          },
          frame.pendingDecision.resumeAtSegmentIndex,
          quantity,
          ledgers,
          params.emptySegmentResult,
          params.segmentKey,
        )
      : pausedSegment.effect.type === "moveCards"
        ? applyResolvedQuantityMoveCardsSegment(
            params.state,
            entry,
            pausedSegment as SequenceEffect["effects"][number] & {
              effect: MoveCardsEffect;
            },
            frame.pendingDecision.resumeAtSegmentIndex,
            quantity,
            ledgers,
            params.emptySegmentResult,
            params.segmentKey,
          )
        : applyResolvedQuantityRevealTopSegment(
            params.state,
            entry,
            pausedSegment as SequenceEffect["effects"][number] & {
              effect: RevealTopEffect;
            },
            frame.pendingDecision.resumeAtSegmentIndex,
            quantity,
            ledgers,
            params.emptySegmentResult,
            params.segmentKey,
          );
  if (!resolved.ok) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }
  return params.resumeSequenceFrameFromLedgers({
    createTrashDecision: params.unsupportedTrashDecision,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: resolved.ledgers,
    state: resolved.state,
  });
};
