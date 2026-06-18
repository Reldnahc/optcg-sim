import type {
  CardRef,
  ChooseOptionalActivationDecision,
  Effect,
  EngineEvent,
  GameState,
  InstanceId,
  OptionalPayCostDecision,
  PayCostDecision,
  SequenceSegmentResult,
} from "@optcg/types";

import {
  frameForPausedSequenceDecision,
  stateWithPausedSequenceFrame,
} from "../frame-decisions.js";
import { applyDrawSegment, saveReference } from "../segments.js";
import { applyFieldMutationSequenceSegment } from "../field-segments.js";
import { resumeSequenceFrameFromLedgers } from "../resume.js";
import { type SupportedSequenceSegment } from "../support.js";
import {
  emptySegmentResult,
  getSupportedFrameContext,
  segmentKey,
  sequenceRuntimeError,
} from "./shared.js";
import { consumeOncePerTurnForQueueEntry } from "../../rules/once-per-turn.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SegmentLedgers,
  SequenceFrameResumeResult,
} from "./types.js";

type DrawEffect = Extract<Effect, { type: "draw" }>;

export const resumeSequenceFrameAfterOptionalActivation = (
  state: GameState,
  decision: ChooseOptionalActivationDecision,
  choice: "activate" | "decline",
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameResumeResult => {
  const context = getSupportedFrameContext(state, decision.id);
  if (!context.ok) {
    return context.result;
  }
  const { entry, frame, supportedBlock } = context;
  const pausedSegment =
    supportedBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (pausedSegment === undefined || pausedSegment.optional !== true) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }

  let nextState = state;
  let events: EngineEvent[] = [];
  let ledgers: SegmentLedgers;
  if (choice === "activate") {
    nextState = consumeOncePerTurnForQueueEntry(
      nextState,
      entry,
      supportedBlock,
    );
    if (pausedSegment.effect.type === "draw") {
      const drawn = applyDrawSegment(
        nextState,
        entry,
        pausedSegment as SupportedSequenceSegment & { effect: DrawEffect },
        frame.pendingDecision.resumeAtSegmentIndex,
        {
          savedReferences: frame.savedReferences,
          segmentResults: frame.segmentResults,
        },
        { incrementStateSeq: false },
        emptySegmentResult,
        segmentKey,
      );
      if (!drawn.ok) {
        return {
          error: sequenceRuntimeError(
            entry.effectBlockId,
            "segment-execution-failed",
          ),
          ok: false,
        };
      }
      nextState = drawn.state;
      events = drawn.events;
      ledgers = drawn.ledgers;
    } else if (pausedSegment.effect.type === "trashFromHand") {
      const decisionResult = createTrashDecision(
        nextState,
        entry,
        pausedSegment.effect,
      );
      if (!decisionResult.ok) {
        return {
          error: sequenceRuntimeError(
            entry.effectBlockId,
            "segment-execution-failed",
          ),
          ok: false,
        };
      }
      const nextDecision = decisionResult.state.pendingDecision;
      if (nextDecision === undefined) {
        return {
          error: sequenceRuntimeError(
            entry.effectBlockId,
            "segment-execution-failed",
          ),
          ok: false,
        };
      }
      const nextFrame = frameForPausedSequenceDecision({
        decision: nextDecision,
        entry,
        index: frame.pendingDecision.resumeAtSegmentIndex,
        savedReferences: frame.savedReferences,
        segmentResults: frame.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: decisionResult.events,
        ok: true,
        state: stateWithPausedSequenceFrame(
          decisionResult.state,
          entry,
          nextFrame,
        ),
      };
    } else {
      const mutation = applyFieldMutationSequenceSegment({
        effectPath: frame.effectPath,
        emptySegmentResult,
        entry,
        events: [],
        index: frame.pendingDecision.resumeAtSegmentIndex,
        ledgers: {
          savedReferences: frame.savedReferences,
          segmentResults: frame.segmentResults,
        },
        pausedLedgers: {
          savedReferences: frame.savedReferences,
          segmentResults: frame.segmentResults,
        },
        segment: pausedSegment,
        segmentKey,
        state: nextState,
      });
      if (!mutation.handled || !mutation.ok) {
        return {
          error: sequenceRuntimeError(
            entry.effectBlockId,
            "unsupported-sequence-shape",
          ),
          ok: false,
        };
      }
      if (mutation.kind === "paused") {
        return {
          events: mutation.events,
          ok: true,
          state: mutation.state,
        };
      }
      nextState = mutation.state;
      events = mutation.events;
      ledgers = mutation.ledgers;
    }
  } else {
    const declinedResult: SequenceSegmentResult = {
      ...emptySegmentResult(),
      attempted: true,
      playerDeclined: true,
    };
    ledgers = {
      savedReferences: frame.savedReferences,
      segmentResults: {
        ...frame.segmentResults,
        [segmentKey(pausedSegment, frame.pendingDecision.resumeAtSegmentIndex)]:
          declinedResult,
      },
    };
  }

  const resumed = resumeSequenceFrameFromLedgers({
    createTrashDecision,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers,
    state: nextState,
  });
  if (resumed === undefined) {
    return undefined;
  }
  if (!resumed.ok) {
    return resumed;
  }
  return {
    events: [...events, ...resumed.events],
    ok: true,
    state:
      events.length === 0
        ? resumed.state
        : {
            ...resumed.state,
            eventJournal: [...nextState.eventJournal, ...resumed.events],
          },
  };
};

export const resumeSequenceFrameAfterOptionalCost = (
  state: GameState,
  decision: PayCostDecision | OptionalPayCostDecision,
  paidCost: boolean,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
  paidCostSelectedCards: readonly CardRef[] = [],
  paidCostSelectedDonInstanceIds: readonly InstanceId[] = [],
): SequenceFrameResumeResult => {
  const context = getSupportedFrameContext(state, decision.id);
  if (!context.ok) {
    return context.result;
  }
  const { entry, frame, supportedBlock } = context;
  const pausedSegment =
    supportedBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (pausedSegment === undefined || pausedSegment.effect.type !== "payCost") {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const segmentResult: SequenceSegmentResult = paidCost
    ? {
        ...emptySegmentResult(),
        attempted: true,
        succeeded: true,
        changedState: true,
        paidCost: true,
      }
    : {
        ...emptySegmentResult(),
        attempted: true,
        playerDeclined: true,
      };
  const savedReferences =
    paidCost && pausedSegment.saveResultAs !== undefined
      ? saveReference(frame.savedReferences, pausedSegment, {
          kind: "paidCost",
          paidCost: true,
          ...(paidCostSelectedCards.length === 0
            ? {}
            : { selectedCards: [...paidCostSelectedCards] }),
          ...(paidCostSelectedDonInstanceIds.length === 0
            ? {}
            : { selectedDonInstanceIds: [...paidCostSelectedDonInstanceIds] }),
        })
      : frame.savedReferences;
  const nextState = paidCost
    ? consumeOncePerTurnForQueueEntry(state, entry, supportedBlock)
    : state;
  return resumeSequenceFrameFromLedgers({
    createTrashDecision,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: {
      savedReferences,
      segmentResults: {
        ...frame.segmentResults,
        [segmentKey(pausedSegment, frame.pendingDecision.resumeAtSegmentIndex)]:
          segmentResult,
      },
    },
    state: nextState,
  });
};
