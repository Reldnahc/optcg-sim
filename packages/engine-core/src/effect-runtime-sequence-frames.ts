import type {
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  SelectCardsDecision,
  SequenceSavedResultReference,
  SequenceSegmentResult,
} from "@optcg/types";

import { toCardRef } from "./action-state.js";
import { executeNoChoiceEffectPrimitive } from "./effect-runtime-primitives.js";
import {
  consumeOncePerTurn,
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "./once-per-turn.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type DrawEffect = Extract<Effect, { type: "draw" }>;
type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
type SupportedSequenceSegment = SequenceEffect["effects"][number] & {
  effect: DrawEffect | TrashFromHandEffect;
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
): connector is "always" | "then" | "ifPreviousSucceeded" =>
  connector === "always" ||
  connector === "then" ||
  connector === "ifPreviousSucceeded";

const isSupportedDrawSegment = (effect: Effect): effect is DrawEffect =>
  effect.type === "draw" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

const isSupportedTrashFromHandSegment = (
  effect: Effect,
): effect is TrashFromHandEffect =>
  effect.type === "trashFromHand" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  effect.filter === undefined &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

const isSupportedSequenceBlock = (
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
): effectBlock is SupportedSequenceBlock => {
  if (
    effectBlock === undefined ||
    effectBlock.category !== "auto" ||
    effectBlock.optional === true ||
    effectBlock.cost !== undefined ||
    effectBlock.condition !== undefined ||
    effectBlock.conditionTiming !== undefined ||
    effectBlock.failurePolicy !== undefined ||
    effectBlock.sourcePresencePolicy !== entry.sourcePresencePolicy ||
    effectBlock.effect.type !== "sequence" ||
    effectBlock.effect.effects.length === 0
  ) {
    return false;
  }

  let pendingDecisionSegmentCount = 0;
  let firstPendingDecisionSegmentIndex = -1;
  const allSegmentsSupported = effectBlock.effect.effects.every(
    (segment, index) => {
      if (
        segment.optional === true ||
        !isSupportedConnector(segment.connector) ||
        (index === 0 && segment.connector !== "always")
      ) {
        return false;
      }
      if (isSupportedDrawSegment(segment.effect)) {
        return true;
      }
      if (isSupportedTrashFromHandSegment(segment.effect)) {
        pendingDecisionSegmentCount += 1;
        firstPendingDecisionSegmentIndex = index;
        return pendingDecisionSegmentCount === 1;
      }
      return false;
    },
  );
  return allSegmentsSupported && firstPendingDecisionSegmentIndex > 0;
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
      savedReferences: saveReference(ledgers.savedReferences, segment, {
        kind: "producedObjects",
        objects: produced,
      }),
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

const continueNoDecisionSegments = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SupportedSequenceBlock["effect"],
  startIndex: number,
  ledgers: SegmentLedgers,
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
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
    if (segment.effect.type !== "draw") {
      return { ok: false };
    }
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
  }
  return { events, ledgers: nextLedgers, ok: true, state: nextState };
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
  const allEvents: EngineEvent[] = [];
  let ledgers: SegmentLedgers = { savedReferences: {}, segmentResults: {} };

  for (let index = 0; index < effectBlock.effect.effects.length; index += 1) {
    const segment = effectBlock.effect.effects[index];
    if (segment === undefined) {
      return { ok: false };
    }
    if (
      !shouldAttemptSegment(ledgers.segmentResults, effectBlock.effect, index)
    ) {
      ledgers = {
        ...ledgers,
        segmentResults: {
          ...ledgers.segmentResults,
          [segmentKey(segment, index)]: emptySegmentResult(),
        },
      };
      continue;
    }
    if (segment.effect.type === "draw") {
      const drawn = applyDrawSegment(
        nextState,
        resolvingEntry,
        segment as SupportedSequenceSegment & { effect: DrawEffect },
        index,
        ledgers,
      );
      if (!drawn.ok) {
        return { ok: false };
      }
      nextState = drawn.state;
      ledgers = drawn.ledgers;
      allEvents.push(...drawn.events);
      continue;
    }

    const partialResult: SequenceSegmentResult = {
      ...emptySegmentResult(),
      attempted: true,
    };
    const pausedLedgers: SegmentLedgers = {
      ...ledgers,
      segmentResults: {
        ...ledgers.segmentResults,
        [segmentKey(segment, index)]: partialResult,
      },
    };
    const trashDecision = createTrashDecision(
      nextState,
      resolvingEntry,
      segment.effect,
    );
    if (!trashDecision.ok) {
      return { ok: false };
    }
    const decision = trashDecision.state.pendingDecision;
    if (decision === undefined) {
      return { ok: false };
    }
    const frame: EffectExecutionFrame = {
      queueEntryId: resolvingEntry.id,
      effectBlockId: resolvingEntry.effectBlockId,
      effectPath: ["effect", "sequence"],
      nextSegmentIndex: index + 1,
      segmentResults: pausedLedgers.segmentResults,
      savedReferences: pausedLedgers.savedReferences,
      transientSets: {},
      pendingDecision: {
        decisionId: decision.id,
        causedBy: decision.causedBy,
        createdAtStateSeq: trashDecision.state.seq,
        resumeAtSegmentIndex: index,
      },
    };
    return {
      events: [...allEvents, ...trashDecision.events],
      ok: true,
      state: {
        ...trashDecision.state,
        effectExecutionFrames: [
          ...trashDecision.state.effectExecutionFrames.filter(
            (candidate) => candidate.queueEntryId !== resolvingEntry.id,
          ),
          frame,
        ],
      },
    };
  }

  return { ok: false };
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
  const continued = continueNoDecisionSegments(
    state,
    entry,
    effectBlock.effect,
    frame.nextSegmentIndex,
    ledgers,
  );
  if (!continued.ok) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }

  return {
    events: continued.events,
    ok: true,
    state: removeFrame(continued.state, frame),
  };
};
