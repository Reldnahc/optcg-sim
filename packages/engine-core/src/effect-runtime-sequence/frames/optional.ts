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
import {
  applyDrawSegment,
  applyMoveCardsSegment,
  saveReference,
} from "../segments.js";
import { applyFieldMutationSequenceSegment } from "../field-segments.js";
import { resumeSequenceFrameFromLedgers } from "../resume.js";
import { type SupportedSequenceSegment } from "../support.js";
import { continueNoDecisionSegments } from "../runner.js";
import {
  emptySegmentResult,
  getSupportedFrameContext,
  sequenceRuntimeError,
} from "./shared.js";
import {
  nestedSequencePath,
  resolveSequenceForPath,
  segmentKeyForPath,
} from "../paths.js";
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
  const pausedSequence = resolveSequenceForPath(
    supportedBlock.effect,
    frame.effectPath,
  );
  const pausedSegment =
    pausedSequence?.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (pausedSegment === undefined || pausedSegment.optional !== true) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const frameSegmentKey = (
    segment: NonNullable<typeof pausedSequence>["effects"][number],
    index: number,
  ): string => segmentKeyForPath(frame.effectPath, segment, index);

  let nextState = state;
  let events: EngineEvent[] = [];
  let ledgers: SegmentLedgers;
  if (choice === "activate") {
    nextState = consumeOncePerTurnForQueueEntry(
      nextState,
      entry,
      supportedBlock,
    );
    const supportedPausedSegment = pausedSegment as SupportedSequenceSegment;
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
        frameSegmentKey,
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
    } else if (pausedSegment.effect.type === "moveCards") {
      const moved = applyMoveCardsSegment(
        nextState,
        entry,
        pausedSegment as SupportedSequenceSegment & {
          effect: Extract<Effect, { type: "moveCards" }>;
        },
        frame.pendingDecision.resumeAtSegmentIndex,
        {
          savedReferences: frame.savedReferences,
          segmentResults: frame.segmentResults,
        },
        emptySegmentResult,
        frameSegmentKey,
      );
      if (!moved.ok) {
        return {
          error: sequenceRuntimeError(
            entry.effectBlockId,
            "segment-execution-failed",
          ),
          ok: false,
        };
      }
      nextState = moved.state;
      events = moved.events;
      ledgers = moved.ledgers;
    } else if (pausedSegment.effect.type === "sequence") {
      const nestedPath = nestedSequencePath(
        frame.effectPath,
        frame.pendingDecision.resumeAtSegmentIndex,
      );
      const run = continueNoDecisionSegments(
        nextState,
        entry,
        pausedSegment.effect,
        supportedBlock,
        0,
        {
          savedReferences: frame.savedReferences,
          segmentResults: frame.segmentResults,
        },
        createTrashDecision,
        false,
        nestedPath,
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
        return {
          events: run.events,
          ok: true,
          state: run.state,
        };
      }
      const resumed = resumeSequenceFrameFromLedgers({
        createTrashDecision,
        effectBlock: supportedBlock,
        entry,
        finalizeCompleted: true,
        frame: {
          ...frame,
          effectPath: nestedPath,
          nextSegmentIndex: pausedSegment.effect.effects.length,
        },
        ledgers: run.ledgers,
        state: run.state,
      });
      return resumed === undefined
        ? undefined
        : resumed.ok
          ? {
              events: [...run.events, ...resumed.events],
              ok: true,
              state: resumed.state,
            }
          : resumed;
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
        segment: supportedPausedSegment,
        segmentKey: frameSegmentKey,
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
        [frameSegmentKey(
          pausedSegment,
          frame.pendingDecision.resumeAtSegmentIndex,
        )]: declinedResult,
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
  const pausedSequence = resolveSequenceForPath(
    supportedBlock.effect,
    frame.effectPath,
  );
  const pausedSegment =
    pausedSequence?.effects[frame.pendingDecision.resumeAtSegmentIndex];
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
  const pausedSegmentKey = segmentKeyForPath(
    frame.effectPath,
    pausedSegment,
    frame.pendingDecision.resumeAtSegmentIndex,
  );
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
        [pausedSegmentKey]: segmentResult,
      },
    },
    state: nextState,
  });
};
