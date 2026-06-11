import type {
  ChooseEffectOptionDecision,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "../../action-results.js";
import { findSequenceFrameByDecisionId } from "../frame-decisions.js";
import {
  continueNoDecisionSegments,
  resolveSequenceForPath,
} from "../runner.js";
import { resumeSequenceFrameFromLedgers } from "../resume.js";
import {
  toSupportedSequenceBlock,
  type SupportedSequenceBlock,
} from "../support.js";
import { choiceOptionPath } from "../paths.js";
import {
  createUnsupportedTrashDecision,
  emptySegmentResult,
  findFrameQueueEntry,
  findSequenceEffectBlock,
  getSupportedFrameContext,
  segmentKey,
  sequenceRuntimeError,
} from "./shared.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SegmentLedgers,
  SequenceFrameResumeResult,
} from "./types.js";

export const resumeSequenceFrameAfterEffectOption = (
  state: GameState,
  decision: ChooseEffectOptionDecision,
  optionId: string,
  createTrashDecision: CreateTrashFromHandSequenceDecision = createUnsupportedTrashDecision,
): SequenceFrameResumeResult => {
  const frame = findSequenceFrameByDecisionId(state, decision.id);
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
  if (effectBlock === undefined || supportedBlock === undefined) {
    return {
      error: sequenceRuntimeError(entry.effectBlockId, "missing-effect-block"),
      ok: false,
    };
  }

  const sequence = resolveSequenceForPath(
    supportedBlock.effect,
    frame.effectPath,
  );
  const choiceIndex = frame.pendingDecision.resumeAtSegmentIndex;
  const segment = sequence?.effects[choiceIndex];
  if (segment === undefined || segment.effect.type !== "choice") {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const optionIndex = segment.effect.options.findIndex(
    (option) => option.id === optionId,
  );
  const option = segment.effect.options[optionIndex];
  if (option === undefined) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: "effectOption",
      optionId,
    },
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }

  const optionPath = choiceOptionPath(
    frame.effectPath,
    choiceIndex,
    optionIndex,
  );
  const optionSequence: Extract<Effect, { type: "sequence" }> =
    option.effect.type === "sequence"
      ? option.effect
      : {
          type: "sequence",
          effects: [{ connector: "always", effect: option.effect }],
        };
  const stateAfterDecision: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete stateAfterDecision.pendingDecision;

  const run = continueNoDecisionSegments(
    stateAfterDecision,
    entry,
    optionSequence,
    0,
    {
      savedReferences: frame.savedReferences,
      segmentResults: frame.segmentResults,
    },
    createTrashDecision,
    false,
    optionPath,
  );
  if (!run.ok) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }
  if (run.kind === "paused") {
    return { events: [...events, ...run.events], ok: true, state: run.state };
  }

  const resumed = resumeSequenceFrameFromLedgers({
    createTrashDecision,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame: {
      ...frame,
      effectPath: optionPath,
      nextSegmentIndex: optionSequence.effects.length,
    },
    ledgers: run.ledgers,
    state: run.state,
  });
  return resumed === undefined
    ? undefined
    : resumed.ok
      ? {
          events: [...events, ...run.events, ...resumed.events],
          ok: true,
          state: resumed.state,
        }
      : resumed;
};

export const resumeSequenceFrameAfterEffectOptionDecline = (
  state: GameState,
  decision: ChooseEffectOptionDecision,
  createTrashDecision: CreateTrashFromHandSequenceDecision = createUnsupportedTrashDecision,
): SequenceFrameResumeResult => {
  const context = getSupportedFrameContext(state, decision.id);
  if (!context.ok) {
    return context.result;
  }
  const { entry, frame, supportedBlock } = context;
  if (decision.min !== 0) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const sequence = resolveSequenceForPath(
    supportedBlock.effect,
    frame.effectPath,
  );
  const choiceIndex = frame.pendingDecision.resumeAtSegmentIndex;
  const segment = sequence?.effects[choiceIndex];
  if (segment === undefined || segment.effect.type !== "choice") {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: "effectOptionDeclined",
    },
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }
  const stateAfterDecision: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete stateAfterDecision.pendingDecision;

  const declinedResult: SequenceSegmentResult = {
    ...emptySegmentResult(),
    attempted: true,
    playerDeclined: true,
  };
  const resumed = resumeSequenceFrameFromLedgers({
    createTrashDecision,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: {
      savedReferences: frame.savedReferences,
      segmentResults: {
        ...frame.segmentResults,
        [segmentKey(segment, choiceIndex)]: declinedResult,
      },
    },
    state: stateAfterDecision,
  });
  return resumed === undefined
    ? undefined
    : resumed.ok
      ? {
          events: [...events, ...resumed.events],
          ok: true,
          state: resumed.state,
        }
      : resumed;
};

export type EffectOptionResumeInternals = {
  entry: EffectQueueEntry;
  frame: EffectExecutionFrame;
  ledgers: SegmentLedgers;
  supportedBlock: SupportedSequenceBlock;
};
