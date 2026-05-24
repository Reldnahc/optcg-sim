/* eslint-disable max-lines */
import type {
  CardRef,
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

import { createSupportedHandSelectionChoiceDecision } from "./effect-runtime-hand-selection.js";
import {
  createChooseQuantityDecisionForSequenceSegment,
  createOptionalActivationDecisionForSequenceSegment,
  createPayCostDecisionForSequenceSegment,
  findSequenceFrameByDecisionId,
  frameForPausedSequenceDecision,
  getSequenceOptionalPayCostOptions,
  stateWithPausedSequenceFrame,
} from "./effect-runtime-sequence-frame-decisions.js";
import { appendEffectResolvedForCompletedSequence } from "./effect-runtime-sequence-frame-events.js";
import {
  applyPlaySelectedSequenceSegment,
  resumePlaySelectedOverflowFrame,
} from "./effect-runtime-play-selected.js";
import {
  resumeSequenceFrameAfterHandSelection as resumeSequenceFrameAfterHandSelectionHelper,
  resumeSequenceFrameAfterTrashFromHand as resumeSequenceFrameAfterTrashFromHandHelper,
} from "./effect-runtime-sequence-select-cards.js";
import { applySavedFieldObjectKoSequenceSegment } from "./effect-runtime-sequence-saved-field-object.js";
import {
  applySelectTargetsSequenceSegment,
  resumeSequenceFrameAfterSelectTargets as resumeSequenceFrameAfterSelectTargetsHelper,
} from "./effect-runtime-sequence-select-targets.js";
import { resumeSequenceFrameAfterChooseQuantity as resumeDrawUpToQuantitySequenceFrame } from "./effect-runtime-sequence-draw-upto.js";
import {
  applySearchRevealSequenceSegment,
  resumeSequenceFrameAfterSearchRevealHelper,
  retargetSequenceFrameAfterSearchRevealOrder,
} from "./effect-runtime-sequence-search-reveal.js";
import {
  applyDrawSegment,
  removeFrame,
  replaceQueueEntry,
  resolvingEntryFor,
  saveReference,
  shouldAttemptSegment,
} from "./effect-runtime-sequence-segments.js";
import {
  toSupportedSequenceBlock,
  type SupportedSequenceBlock,
  type SupportedSequenceSegment,
} from "./effect-runtime-sequence-support.js";
import {
  consumeOncePerTurn,
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "./once-per-turn.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
type DrawEffect = Extract<Effect, { type: "draw" }>;
type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
type PayCostEffect = Extract<SequenceSegmentEffect, { type: "payCost" }>;
type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

export { retargetSequenceFrameAfterSearchRevealOrder };

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
  | { ok: false }
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

type SequenceFrameRunResult =
  | {
      events: EngineEvent[];
      kind: "completed";
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | {
      events: EngineEvent[];
      kind: "paused";
      ok: true;
      state: GameState;
    }
  | { ok: false };

type SequenceRuntimeFailureReason =
  | "missing-frame"
  | "missing-queue-entry"
  | "missing-effect-block"
  | "unsupported-sequence-shape"
  | "segment-execution-failed";

interface SequenceRuntimeErrorDetails {
  reason: SequenceRuntimeFailureReason;
}

const emptySegmentResult = (): SequenceSegmentResult => ({
  attempted: false,
  succeeded: false,
  changedState: false,
  selectedCards: [],
  selectedTargets: [],
  paidCost: false,
  playerDeclined: false,
});

const sequenceRuntimeError = (
  effectId: EffectQueueEntry["effectBlockId"],
  reason: SequenceRuntimeFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SequenceRuntimeErrorDetails,
});

const segmentKey = (
  _segment: SequenceEffect["effects"][number],
  index: number,
): string => String(index);

const findFrameQueueEntry = (
  state: GameState,
  frame: EffectExecutionFrame,
): EffectQueueEntry | undefined =>
  state.effectQueue.find(
    (entry) =>
      entry.id === frame.queueEntryId &&
      entry.effectBlockId === frame.effectBlockId,
  );

const findSequenceEffectBlock = (
  state: GameState,
  entry: EffectQueueEntry,
): EffectDefinition["effects"][number] | undefined => {
  const card = state.cardManifest.cards[entry.source.cardId];
  const definitionId = card?.support.effectDefinitionId;
  if (
    card === undefined ||
    card.support.status !== "implemented-dsl" ||
    definitionId === undefined
  ) {
    return undefined;
  }
  return state.cardManifest.effectDefinitions?.[definitionId]?.effects.find(
    (effect) => effect.id === entry.effectBlockId,
  );
};

const resumeSequenceFrameFromLedgers = (params: {
  createTrashDecision: CreateTrashFromHandSequenceDecision;
  effectBlock: SupportedSequenceBlock;
  entry: EffectQueueEntry;
  finalizeCompleted: boolean;
  frame: EffectExecutionFrame;
  ledgers: SegmentLedgers;
  state: GameState;
}): SequenceFrameResumeResult => {
  const continued = continueNoDecisionSegments(
    params.state,
    params.entry,
    params.effectBlock.effect,
    params.frame.nextSegmentIndex,
    params.ledgers,
    params.createTrashDecision,
    false,
  );
  if (!continued.ok) {
    return {
      error: sequenceRuntimeError(
        params.entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }
  if (continued.kind === "paused") {
    return {
      events: continued.events,
      ok: true,
      state: continued.state,
    };
  }

  const events = [...continued.events];
  let completedState = removeFrame(continued.state, params.frame);
  if (params.finalizeCompleted) {
    completedState = appendEffectResolvedForCompletedSequence(
      completedState,
      params.entry,
      events,
    );
  }
  return {
    events,
    ok: true,
    state: completedState,
  };
};

const continueNoDecisionSegments = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SupportedSequenceBlock["effect"],
  startIndex: number,
  ledgers: SegmentLedgers,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
  incrementStateSeqForDraw: boolean,
): SequenceFrameRunResult => {
  let nextState = state;
  let nextLedgers = ledgers;
  const events: EngineEvent[] = [];
  for (let index = startIndex; index < effect.effects.length; index += 1) {
    const segment = effect.effects[index];
    if (segment === undefined) {
      return { ok: false };
    }
    if (
      !shouldAttemptSegment(
        nextLedgers.segmentResults,
        effect,
        index,
        segmentKey,
      )
    ) {
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [segmentKey(segment, index)]: emptySegmentResult(),
        },
      };
      continue;
    }
    if (segment.optional === true) {
      const partialResult: SequenceSegmentResult = {
        ...emptySegmentResult(),
        attempted: true,
      };
      const pausedLedgers: SegmentLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [segmentKey(segment, index)]: partialResult,
        },
      };
      const optionalDecision =
        createOptionalActivationDecisionForSequenceSegment(
          nextState,
          entry,
          index,
        );
      const decision = optionalDecision.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: optionalDecision.state,
      });
      return {
        events: [...events, ...optionalDecision.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(
          optionalDecision.state,
          entry,
          frame,
        ),
      };
    }
    if (segment.effect.type === "draw") {
      const drawn = applyDrawSegment(
        nextState,
        entry,
        segment as SupportedSequenceSegment & { effect: DrawEffect },
        index,
        nextLedgers,
        { incrementStateSeq: incrementStateSeqForDraw },
        emptySegmentResult,
        segmentKey,
      );
      if (!drawn.ok) {
        return { ok: false };
      }
      nextState = drawn.state;
      nextLedgers = drawn.ledgers;
      events.push(...drawn.events);
      continue;
    }
    if (segment.effect.type === "drawUpTo") {
      const quantityDecision = createChooseQuantityDecisionForSequenceSegment(
        nextState,
        entry,
        index,
        segment.effect.count,
      );
      const decision = quantityDecision.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        index,
        savedReferences: nextLedgers.savedReferences,
        segmentResults: nextLedgers.segmentResults,
        state: quantityDecision.state,
      });
      return {
        events: [...events, ...quantityDecision.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(
          quantityDecision.state,
          entry,
          frame,
        ),
      };
    }
    if (segment.effect.type === "search") {
      const search = applySearchRevealSequenceSegment({
        emptySegmentResult,
        entry,
        events,
        index,
        nextLedgers,
        nextState,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<
            SupportedSequenceSegment["effect"],
            { type: "search" }
          >;
        },
        segmentKey,
      });
      if (!search.ok || search.kind === "paused") {
        return search;
      }
      nextState = search.state;
      nextLedgers = search.ledgers;
      continue;
    }
    const partialResult: SequenceSegmentResult = {
      ...emptySegmentResult(),
      attempted: true,
    };
    const pausedLedgers: SegmentLedgers = {
      ...nextLedgers,
      segmentResults: {
        ...nextLedgers.segmentResults,
        [segmentKey(segment, index)]: partialResult,
      },
    };
    if (segment.effect.type === "payCost") {
      const paySegment = segment as SupportedSequenceSegment & {
        effect: PayCostEffect;
      };
      const cost = paySegment.effect.cost;
      const paymentOptions = getSequenceOptionalPayCostOptions(
        nextState,
        entry,
        cost,
      );
      if (paymentOptions.length === 0) {
        nextLedgers = {
          ...nextLedgers,
          segmentResults: {
            ...nextLedgers.segmentResults,
            [segmentKey(segment, index)]: {
              ...emptySegmentResult(),
              attempted: true,
            },
          },
        };
        continue;
      }
      const decisionResult = createPayCostDecisionForSequenceSegment(
        nextState,
        entry,
        cost,
        paymentOptions,
        index,
      );
      const decision = decisionResult.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: [...events, ...decisionResult.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
      };
    }
    if (segment.effect.type === "selectCards") {
      const decisionResult = createSupportedHandSelectionChoiceDecision(
        nextState,
        entry,
        segment.effect,
        index,
      );
      if (!decisionResult.ok) {
        nextLedgers = {
          ...nextLedgers,
          segmentResults: {
            ...nextLedgers.segmentResults,
            [segmentKey(segment, index)]: {
              ...emptySegmentResult(),
              attempted: true,
            },
          },
        };
        continue;
      }
      const decision = decisionResult.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: [...events, ...decisionResult.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
      };
    }
    if (segment.effect.type === "selectTargets") {
      const selectTargets = applySelectTargetsSequenceSegment({
        emptySegmentResult,
        entry,
        events,
        index,
        nextLedgers,
        nextState,
        segmentKey,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<SequenceSegmentEffect, { type: "selectTargets" }>;
        },
      });
      if (!selectTargets.ok || selectTargets.kind === "paused") {
        return selectTargets;
      }
      nextState = selectTargets.state;
      nextLedgers = selectTargets.ledgers;
      continue;
    }
    if (segment.effect.type === "playSelected") {
      const played = applyPlaySelectedSequenceSegment({
        emptySegmentResult,
        entry,
        events,
        index,
        ledgers: nextLedgers,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<SequenceSegmentEffect, { type: "playSelected" }>;
        },
        segmentKey,
        state: nextState,
      });
      if (played.kind === "paused") {
        return played;
      }
      nextState = played.state;
      nextLedgers = played.ledgers;
      continue;
    }
    if (segment.effect.type === "ko") {
      const resolvedKo = applySavedFieldObjectKoSequenceSegment({
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment,
        segmentKey,
        state: nextState,
      });
      nextState = resolvedKo.state;
      nextLedgers = resolvedKo.ledgers;
      events.push(...resolvedKo.events);
      continue;
    }
    const decisionResult = createTrashDecision(
      nextState,
      entry,
      segment.effect,
    );
    if (!decisionResult.ok) {
      return { ok: false };
    }
    const decision = decisionResult.state.pendingDecision;
    if (decision === undefined) {
      return { ok: false };
    }
    const frame = frameForPausedSequenceDecision({
      decision,
      entry,
      index,
      savedReferences: pausedLedgers.savedReferences,
      segmentResults: pausedLedgers.segmentResults,
      state: decisionResult.state,
    });
    return {
      events: [...events, ...decisionResult.events],
      kind: "paused",
      ok: true,
      state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
    };
  }
  return {
    events,
    kind: "completed",
    ledgers: nextLedgers,
    ok: true,
    state: nextState,
  };
};

export const createSupportedSequenceFrameDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameDecisionResult => {
  if (effectBlock?.effect.type !== "sequence") {
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
    return {
      events: run.events,
      ok: true,
      state: appendEffectResolvedForCompletedSequence(
        run.state,
        resolvingEntry,
        run.events,
      ),
    };
  }
  return { events: run.events, ok: true, state: run.state };
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
): SequenceFrameResumeResult =>
  resumeSequenceFrameAfterSearchRevealHelper({
    createUnsupportedTrashDecision,
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
    segmentKey,
    sequenceRuntimeError,
    state,
    unsupportedTrashDecision: createUnsupportedTrashDecision,
  });
};
