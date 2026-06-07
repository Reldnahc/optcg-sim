import type {
  CardRef,
  ChooseEffectOptionDecision,
  ChooseOptionalActivationDecision,
  Effect,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  OptionalPayCostDecision,
  PayCostDecision,
  SelectTargetsDecision,
  SelectCardsDecision,
  SequenceSegmentResult,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "../action-results.js";
import {
  findSequenceFrameByDecisionId,
  frameForPausedSequenceDecision,
  stateWithPausedSequenceFrame,
} from "./frame-decisions.js";
import { appendEffectResolvedForCompletedSequence } from "./frame-events.js";
import { entryWithCompletedSequencePresentation } from "./completed-presentation.js";
import { resumePlaySelectedOverflowFrame } from "../runtime/primitives/play-selected.js";
import {
  resumeSequenceFrameAfterHandSelection as resumeSequenceFrameAfterHandSelectionHelper,
  resumeSequenceFrameAfterTrashFromHand as resumeSequenceFrameAfterTrashFromHandHelper,
} from "./select-cards.js";
import { resumeSequenceFrameAfterSelectTargets as resumeSequenceFrameAfterSelectTargetsHelper } from "./select-targets.js";
import { resumeSequenceFrameAfterChooseQuantity as resumeDrawUpToQuantitySequenceFrame } from "./draw-upto.js";
import {
  resumeSequenceFrameAfterSearchRevealHelper,
  retargetSequenceFrameAfterSearchRevealOrder,
} from "./search-reveal.js";
import {
  continueNoDecisionSegments,
  emptySegmentResult,
  resolveSequenceForPath,
  segmentKey,
  segmentKeyForPath,
  sequenceRuntimeError,
} from "./runner.js";
import {
  findFrameQueueEntry,
  findSequenceEffectBlock,
  resumeSequenceFrameFromLedgers,
} from "./resume.js";
import {
  applyDrawSegment,
  replaceQueueEntry,
  resolvingEntryFor,
  saveReference,
} from "./segments.js";
import {
  toSupportedSequenceBlock,
  type SupportedSequenceBlock,
  type SupportedSequenceSegment,
} from "./support.js";
import { choiceOptionPath } from "./paths.js";
import {
  consumeOncePerTurn,
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "../rules/once-per-turn.js";

type DrawEffect = Extract<Effect, { type: "draw" }>;
type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

export { retargetSequenceFrameAfterSearchRevealOrder };
export { resumeSequenceFrameAfterSelectedHandDeckPlacement } from "./selected-hand-deck-placement.js";

type TrashDecisionResult =
  | {
      events: EngineEvent[];
      ok: true;
      state: GameState;
    }
  | {
      error: EngineError;
      events: EngineEvent[];
      ok: false;
      state: GameState;
    };

export type CreateTrashFromHandSequenceDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: TrashFromHandEffect,
) => TrashDecisionResult;

const createUnsupportedTrashDecision: CreateTrashFromHandSequenceDecision = (
  state,
  entry,
) => ({
  error: sequenceRuntimeError(
    entry.effectBlockId,
    "unsupported-sequence-shape",
  ),
  events: [],
  ok: false,
  state,
});

export type SequenceFrameDecisionResult =
  | {
      events: EngineEvent[];
      ok: true;
      state: GameState;
    }
  | { error?: EngineError; ok: false }
  | undefined;

export type SequenceFrameResumeResult =
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

export const createSupportedSequenceFrameDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameDecisionResult => {
  if (
    effectBlock === undefined ||
    (effectBlock.effect.type !== "sequence" &&
      effectBlock.effect.type !== "choice")
  ) {
    return undefined;
  }
  const supportedBlock = toSupportedSequenceBlock(entry, effectBlock);
  if (supportedBlock === undefined) {
    return { ok: false };
  }

  let nextState = state;
  if (effectBlock.oncePerTurn === true) {
    const oncePerTurnKey = toOncePerTurnKey({
      cardInstanceId: entry.source.instanceId,
      effectId: entry.effectBlockId,
      turnNumber: nextState.turn.globalTurn,
    });
    if (isOncePerTurnUsed(nextState, oncePerTurnKey)) {
      return { ok: false };
    }
    nextState = consumeOncePerTurn(nextState, oncePerTurnKey);
  }

  const resolvingEntry = resolvingEntryFor(entry);
  nextState = replaceQueueEntry(nextState, resolvingEntry);
  const ledgers: SegmentLedgers = { savedReferences: {}, segmentResults: {} };

  const run = continueNoDecisionSegments(
    nextState,
    resolvingEntry,
    supportedBlock.effect,
    0,
    ledgers,
    createTrashDecision,
    true,
  );
  if (!run.ok) {
    return { ok: false };
  }
  if (run.kind === "completed") {
    const completed = appendEffectResolvedForCompletedSequence(
      run.state,
      entryWithCompletedSequencePresentation(
        resolvingEntry,
        run.ledgers.segmentResults,
      ),
      run.events,
    );
    if (!completed.ok) {
      return { error: completed.error, ok: false };
    }
    return {
      events: run.events,
      ok: true,
      state: completed.state,
    };
  }
  return { events: run.events, ok: true, state: run.state };
};

export const continueSupportedSequenceFrameFromSegment = (params: {
  completedSegmentResults: EffectExecutionFrame["segmentResults"];
  effectBlock: EffectDefinition["effects"][number];
  entry: EffectQueueEntry;
  resumePendingDecision?: NonNullable<GameState["pendingDecision"]>;
  startIndex: number;
  state: GameState;
}): SequenceFrameResumeResult => {
  const supportedBlock = toSupportedSequenceBlock(
    params.entry,
    params.effectBlock,
  );
  if (supportedBlock === undefined) {
    return {
      error: sequenceRuntimeError(
        params.entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const stateWithEntry = params.state.effectQueue.some(
    (candidate) => candidate.id === params.entry.id,
  )
    ? params.state
    : {
        ...params.state,
        effectQueue: [...params.state.effectQueue, params.entry],
      };
  const resolvingEntry = resolvingEntryFor(params.entry);
  const run = continueNoDecisionSegments(
    replaceQueueEntry(stateWithEntry, resolvingEntry),
    resolvingEntry,
    supportedBlock.effect,
    params.startIndex,
    { savedReferences: {}, segmentResults: params.completedSegmentResults },
    createUnsupportedTrashDecision,
    false,
  );
  if (!run.ok) {
    return {
      error: sequenceRuntimeError(
        params.entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }
  if (run.kind === "paused") {
    const pendingDecision = run.state.pendingDecision;
    const entry = resolvingEntry;
    const resumePendingDecision = params.resumePendingDecision;
    const state =
      pendingDecision === undefined || resumePendingDecision === undefined
        ? run.state
        : {
            ...run.state,
            effectExecutionFrames: run.state.effectExecutionFrames.map(
              (frame) =>
                frame.queueEntryId === entry.id &&
                frame.pendingDecision.decisionId === pendingDecision.id
                  ? {
                      ...frame,
                      resumePendingDecision,
                    }
                  : frame,
            ),
          };
    return { events: run.events, ok: true, state };
  }
  const completed = appendEffectResolvedForCompletedSequence(
    run.state,
    entryWithCompletedSequencePresentation(
      resolvingEntry,
      run.ledgers.segmentResults,
    ),
    run.events,
  );
  if (!completed.ok) {
    return { error: completed.error, ok: false };
  }
  return {
    events: run.events,
    ok: true,
    state:
      completed.state.pendingDecision === undefined &&
      params.resumePendingDecision !== undefined
        ? { ...completed.state, pendingDecision: params.resumePendingDecision }
        : completed.state,
  };
};

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
    segmentKey,
    selectedTargets,
    sequenceRuntimeError,
    state,
  });
};

export const resumeSequenceFrameAfterSearchReveal = (
  state: GameState,
  decisionId: SelectCardsDecision["id"],
  selectedCards: readonly CardRef[],
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameResumeResult =>
  resumeSequenceFrameAfterSearchRevealHelper({
    createTrashDecision,
    decisionId,
    emptySegmentResult,
    findFrameQueueEntry,
    findSequenceEffectBlock,
    toSupportedSequenceBlock,
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

export const resumeSequenceFrameAfterOptionalActivation = (
  state: GameState,
  decision: ChooseOptionalActivationDecision,
  choice: "activate" | "decline",
  createTrashDecision: CreateTrashFromHandSequenceDecision,
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
  if (supportedBlock === undefined) {
    return {
      error: sequenceRuntimeError(entry.effectBlockId, "missing-effect-block"),
      ok: false,
    };
  }
  const pausedSegment =
    supportedBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    (pausedSegment.effect.type !== "draw" &&
      pausedSegment.effect.type !== "trashFromHand") ||
    pausedSegment.optional !== true
  ) {
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
    } else {
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
  if (supportedBlock === undefined) {
    return {
      error: sequenceRuntimeError(entry.effectBlockId, "missing-effect-block"),
      ok: false,
    };
  }
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
        })
      : frame.savedReferences;
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
    state,
  });
};

export const resumeSequenceFrameAfterReplacement = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
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
  const pausedSegment =
    supportedBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    (pausedSegment.effect.type !== "ko" &&
      pausedSegment.effect.type !== "bounce")
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
    createTrashDecision: createUnsupportedTrashDecision,
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
            selectedTargets:
              frame.segmentResults[
                segmentKey(
                  pausedSegment,
                  frame.pendingDecision.resumeAtSegmentIndex,
                )
              ]?.selectedTargets ?? [],
          },
      },
    },
    state,
  });
};

export const resumeSequenceFrameAfterPlaySelectedOverflow = (
  state: GameState,
  decisionId: SelectCardsDecision["id"],
): SequenceFrameResumeResult => {
  const frame = state.effectExecutionFrames.find(
    (candidate) => candidate.pendingDecision.decisionId === decisionId,
  );
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
  return resumePlaySelectedOverflowFrame({
    createUnsupportedTrashDecision,
    effectBlock: supportedBlock,
    emptySegmentResult,
    entry,
    frame,
    resumeSequenceFrameFromLedgers,
    segmentKey,
    sequenceRuntimeError,
    state,
  });
};

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
