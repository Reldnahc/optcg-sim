import type {
  CardInstance,
  CardRef,
  ChooseOptionalActivationDecision,
  Effect,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  PayCostDecision,
  SavedFieldObjectReference,
  SelectCardsDecision,
  SequenceSavedResultReference,
  SequenceSegmentResult,
} from "@optcg/types";

import { toCardRef } from "./action-state.js";
import {
  createOptionalActivationDecisionForSequenceSegment,
  createPayCostDecisionForSequenceSegment,
  findSequenceFrameByDecisionId,
  frameForPausedSequenceDecision,
  stateWithPausedSequenceFrame,
} from "./effect-runtime-sequence-frame-decisions.js";
import { appendEffectResolvedForCompletedSequence } from "./effect-runtime-sequence-frame-events.js";
import { executeNoChoiceEffectPrimitive } from "./effect-runtime-primitives.js";
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
type SupportedSequenceSegment = SequenceEffect["effects"][number] & {
  effect: DrawEffect | TrashFromHandEffect | PayCostEffect;
};

type SupportedSequenceBlock = EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: SequenceEffect & { effects: SupportedSequenceSegment[] };
};

type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

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

const isSupportedConnector = (
  connector: SequenceEffect["effects"][number]["connector"],
): connector is "always" | "then" | "ifPreviousSucceeded" | "ifYouDo" =>
  connector === "always" ||
  connector === "then" ||
  connector === "ifPreviousSucceeded" ||
  connector === "ifYouDo";

const isSupportedDrawSegment = (
  effect: SequenceSegmentEffect,
): effect is DrawEffect =>
  effect.type === "draw" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

const isSupportedTrashFromHandSegment = (
  effect: SequenceSegmentEffect,
): effect is TrashFromHandEffect =>
  effect.type === "trashFromHand" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  effect.filter === undefined &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

const isSupportedPayCostSegment = (
  effect: SequenceSegmentEffect,
): effect is PayCostEffect =>
  effect.type === "payCost" &&
  effect.cost.type === "restDon" &&
  (effect.cost.chooser === undefined || effect.cost.chooser === "self") &&
  Number.isInteger(effect.cost.count) &&
  effect.cost.count > 0;

const isSupportedSequenceBlock = (
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
): effectBlock is SupportedSequenceBlock => {
  if (
    effectBlock === undefined ||
    effectBlock.category !== "auto" ||
    effectBlock.optional === true ||
    effectBlock.cost !== undefined ||
    effectBlock.conditionTiming !== undefined ||
    effectBlock.failurePolicy !== undefined ||
    effectBlock.sourcePresencePolicy !== entry.sourcePresencePolicy ||
    effectBlock.effect.type !== "sequence" ||
    effectBlock.effect.effects.length === 0
  ) {
    return false;
  }

  let hasPendingDecisionSegment = false;
  const allSegmentsSupported = effectBlock.effect.effects.every(
    (segment, index) => {
      if (
        !isSupportedConnector(segment.connector) ||
        (index === 0 && segment.connector !== "always")
      ) {
        return false;
      }
      if (isSupportedDrawSegment(segment.effect)) {
        if (segment.optional === true) {
          hasPendingDecisionSegment = true;
        }
        return true;
      }
      if (isSupportedTrashFromHandSegment(segment.effect)) {
        if (index === 0) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedPayCostSegment(segment.effect)) {
        if (segment.optional === true) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      return false;
    },
  );
  return allSegmentsSupported && hasPendingDecisionSegment;
};

const previousSegmentSucceeded = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  index: number,
): boolean => {
  const previous = effect.effects[index - 1];
  if (previous === undefined) {
    return false;
  }
  const result = segmentResults[segmentKey(previous, index - 1)];
  return (
    result !== undefined &&
    result.succeeded &&
    (result.changedState ||
      result.selectedCards.length > 0 ||
      result.selectedTargets.length > 0 ||
      result.paidCost)
  );
};

const previousSegmentCompleted = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  index: number,
): boolean => {
  const previous = effect.effects[index - 1];
  if (previous === undefined) {
    return false;
  }
  const result = segmentResults[segmentKey(previous, index - 1)];
  return result !== undefined && result.attempted && result.succeeded;
};

const shouldAttemptSegment = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  index: number,
): boolean => {
  const segment = effect.effects[index];
  if (segment === undefined) {
    return false;
  }
  if (segment.connector === "always") {
    return true;
  }
  if (segment.connector === "then") {
    return previousSegmentCompleted(segmentResults, effect, index);
  }
  return previousSegmentSucceeded(segmentResults, effect, index);
};

const resolvingEntryFor = (entry: EffectQueueEntry): EffectQueueEntry => ({
  ...entry,
  state: "resolving",
});

const replaceQueueEntry = (
  state: GameState,
  entry: EffectQueueEntry,
): GameState => ({
  ...state,
  effectQueue: state.effectQueue.map((candidate) =>
    candidate.id === entry.id ? entry : candidate,
  ),
});

const removeFrame = (
  state: GameState,
  frame: EffectExecutionFrame,
): GameState => ({
  ...state,
  effectExecutionFrames: state.effectExecutionFrames.filter(
    (candidate) =>
      candidate.queueEntryId !== frame.queueEntryId ||
      candidate.pendingDecision.decisionId !== frame.pendingDecision.decisionId,
  ),
});

const playerHandProducedByDraw = (
  before: readonly CardInstance[],
  after: readonly CardInstance[],
  playerId: EffectQueueEntry["controllerId"],
): CardRef[] => {
  const beforeIds = new Set(before.map((card) => card.instanceId));
  return after
    .filter((card) => !beforeIds.has(card.instanceId))
    .map((card) => toCardRef(card, playerId));
};

const toSavedProducedObjects = (
  segment: SupportedSequenceSegment & {
    effect: DrawEffect;
    saveResultAs: string;
  },
  objects: CardRef[],
  capturedAtStateSeq: GameState["seq"],
): SavedFieldObjectReference[] =>
  objects.map((object, objectIndex) => ({
    binding: {
      family: "producedObjects",
      objectIndex,
      saveResultAs: segment.saveResultAs,
      ...(segment.id === undefined ? {} : { sourceSegmentId: segment.id }),
    },
    capturedAtStateSeq,
    object,
    visibility: "public",
  }));

const saveReference = (
  savedReferences: EffectExecutionFrame["savedReferences"],
  segment: SequenceEffect["effects"][number],
  reference: SequenceSavedResultReference,
): EffectExecutionFrame["savedReferences"] =>
  segment.saveResultAs === undefined
    ? savedReferences
    : { ...savedReferences, [segment.saveResultAs]: reference };

const applyDrawSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment & { effect: DrawEffect },
  index: number,
  ledgers: SegmentLedgers,
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const beforePlayer = state.players[entry.controllerId];
  if (beforePlayer === undefined) {
    return { ok: false };
  }
  const resolution = executeNoChoiceEffectPrimitive(
    state,
    entry,
    segment.effect,
  );
  if (resolution.errors !== undefined) {
    return { ok: false };
  }
  const afterPlayer = resolution.state.players[entry.controllerId];
  if (afterPlayer === undefined) {
    return { ok: false };
  }
  const produced = playerHandProducedByDraw(
    beforePlayer.hand,
    afterPlayer.hand,
    entry.controllerId,
  );
  const savedReferences =
    segment.saveResultAs === undefined
      ? ledgers.savedReferences
      : saveReference(ledgers.savedReferences, segment, {
          kind: "producedObjects",
          objects: toSavedProducedObjects(
            { ...segment, saveResultAs: segment.saveResultAs },
            produced,
            resolution.state.seq,
          ),
        });
  const result: SequenceSegmentResult = {
    ...emptySegmentResult(),
    attempted: true,
    succeeded: true,
    changedState: resolution.events.length > 0,
  };
  return {
    events: resolution.events,
    ledgers: {
      segmentResults: {
        ...ledgers.segmentResults,
        [segmentKey(segment, index)]: result,
      },
      savedReferences,
    },
    ok: true,
    state: resolution.state,
  };
};

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

const activeDonCount = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
): number =>
  state.players[playerId]?.costArea.filter((card) => card.state === "active")
    .length ?? 0;

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
): SequenceFrameRunResult => {
  let nextState = state;
  let nextLedgers = ledgers;
  const events: EngineEvent[] = [];
  for (let index = startIndex; index < effect.effects.length; index += 1) {
    const segment = effect.effects[index];
    if (segment === undefined) {
      return { ok: false };
    }
    if (!shouldAttemptSegment(nextLedgers.segmentResults, effect, index)) {
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
      );
      if (!drawn.ok) {
        return { ok: false };
      }
      nextState = drawn.state;
      nextLedgers = drawn.ledgers;
      events.push(...drawn.events);
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
      if (cost.type !== "restDon") {
        return { ok: false };
      }
      if (activeDonCount(nextState, entry.controllerId) < cost.count) {
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
  if (!isSupportedSequenceBlock(entry, effectBlock)) {
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
    effectBlock.effect,
    0,
    ledgers,
    createTrashDecision,
  );
  if (!run.ok || run.kind !== "paused") {
    return { ok: false };
  }
  return { events: run.events, ok: true, state: run.state };
};

export const resumeSequenceFrameAfterTrashFromHand = (
  state: GameState,
  decision: SelectCardsDecision,
  selectedCards: readonly CardRef[],
): SequenceFrameResumeResult => {
  const frame = state.effectExecutionFrames.find(
    (candidate) => candidate.pendingDecision.decisionId === decision.id,
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
  if (!isSupportedSequenceBlock(entry, effectBlock)) {
    return {
      error: sequenceRuntimeError(entry.effectBlockId, "missing-effect-block"),
      ok: false,
    };
  }
  const pausedSegment =
    effectBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    pausedSegment.effect.type !== "trashFromHand"
  ) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }

  const completedPausedResult: SequenceSegmentResult = {
    ...emptySegmentResult(),
    attempted: true,
    succeeded: true,
    changedState: selectedCards.length > 0,
    selectedCards: [...selectedCards],
  };
  const ledgers: SegmentLedgers = {
    segmentResults: {
      ...frame.segmentResults,
      [segmentKey(pausedSegment, frame.pendingDecision.resumeAtSegmentIndex)]:
        completedPausedResult,
    },
    savedReferences: saveReference(frame.savedReferences, pausedSegment, {
      kind: "selectedCards",
      cards: [...selectedCards],
    }),
  };
  const continued = resumeSequenceFrameFromLedgers({
    createTrashDecision: createUnsupportedTrashDecision,
    effectBlock,
    entry,
    finalizeCompleted: false,
    frame,
    ledgers,
    state,
  });
  return continued;
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
  if (!isSupportedSequenceBlock(entry, effectBlock)) {
    return {
      error: sequenceRuntimeError(entry.effectBlockId, "missing-effect-block"),
      ok: false,
    };
  }
  const pausedSegment =
    effectBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
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
    effectBlock,
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
  decision: PayCostDecision,
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
  if (!isSupportedSequenceBlock(entry, effectBlock)) {
    return {
      error: sequenceRuntimeError(entry.effectBlockId, "missing-effect-block"),
      ok: false,
    };
  }
  const pausedSegment =
    effectBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
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
    effectBlock,
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
