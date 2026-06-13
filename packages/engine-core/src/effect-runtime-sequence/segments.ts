import type {
  CardInstance,
  CardRef,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  EventVisibility,
  GameState,
  SavedFieldObjectReference,
  SequenceSavedResultReference,
  SequenceSegmentResult,
  PlayerId,
} from "@optcg/types";

import { toCardRef } from "../actions/state.js";
import { appendEvent, toStateSeq } from "../action-results.js";
import {
  executeDrawPrimitiveForResolvedQuantity,
  executeNoChoiceEffectPrimitive,
  resolvePlayerId,
} from "../runtime/primitives/execute.js";
import { executeMoveCardsPrimitive } from "../effect-runtime-move-cards.js";
import {
  applyReturnDonPayment,
  getReturnDonEligibleInstanceIds,
} from "../runtime/primitives/return-don.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type DrawEffect = Extract<Effect, { type: "draw" }>;
type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
type ReturnDonEffect = Extract<Effect, { type: "returnDon" }>;
type RevealTopEffect = Extract<Effect, { type: "revealTop" }>;

const revealTopVisibility = (
  visibility: RevealTopEffect["visibility"],
  controllerId: PlayerId,
): EventVisibility =>
  visibility === "chooserOnly"
    ? { type: "private", playerId: controllerId }
    : { type: "public" };

export type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

export type SupportedSequenceSegment = SequenceEffect["effects"][number] & {
  effect:
    | DrawEffect
    | MoveCardsEffect
    | ReturnDonEffect
    | RevealTopEffect
    | Extract<Effect, { type: "trashFromHand" }>
    | Extract<SequenceEffect["effects"][number]["effect"], { type: "payCost" }>
    | Extract<Effect, { type: "selectCards" }>;
};

export const applyMoveCardsSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment & { effect: MoveCardsEffect },
  index: number,
  ledgers: SegmentLedgers,
  emptySegmentResult: () => SequenceSegmentResult,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const resolution = executeMoveCardsPrimitive(state, entry, segment.effect);
  if (resolution.errors !== undefined) {
    return { ok: false };
  }
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
      savedReferences: ledgers.savedReferences,
    },
    ok: true,
    state: resolution.state,
  };
};

export const applyNoOpReturnDonSegment = (
  state: GameState,
  segment: SupportedSequenceSegment & { effect: ReturnDonEffect },
  index: number,
  ledgers: SegmentLedgers,
  emptySegmentResult: () => SequenceSegmentResult,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => ({
  events: [],
  ledgers: {
    ...ledgers,
    segmentResults: {
      ...ledgers.segmentResults,
      [segmentKey(segment, index)]: {
        ...emptySegmentResult(),
        attempted: true,
        succeeded: true,
      },
    },
  },
  ok: true,
  state,
});

export const applySelectedReturnDonSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  playerId: PlayerId,
  segment: SupportedSequenceSegment & { effect: ReturnDonEffect },
  index: number,
  selectedDonIds: readonly CardInstance["instanceId"][],
  ledgers: SegmentLedgers,
  emptySegmentResult: () => SequenceSegmentResult,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  if (selectedDonIds.length === 0) {
    return {
      events: [],
      ledgers: {
        ...ledgers,
        segmentResults: {
          ...ledgers.segmentResults,
          [segmentKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
          },
        },
      },
      ok: true,
      state,
    };
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return { ok: false };
  }
  const eligibleIds = new Set(getReturnDonEligibleInstanceIds(player));
  if (selectedDonIds.some((donId) => !eligibleIds.has(donId))) {
    return { ok: false };
  }
  const returned = applyReturnDonPayment({
    player,
    playerId,
    selectedDonIds,
  });
  if (returned === null) {
    return { ok: false };
  }
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    players: {
      ...state.players,
      [playerId]: returned,
    },
  };
  const events: EngineEvent[] = [];
  selectedDonIds.forEach((donInstanceId) => {
    appendEvent(
      nextState,
      events,
      "donReturned",
      {
        playerId,
        donInstanceId,
        state: "donDeck",
        sourceControllerId: entry.controllerId,
        sourceKind: "effect",
      },
      { type: "public" },
    );
  });
  return {
    events,
    ledgers: {
      ...ledgers,
      segmentResults: {
        ...ledgers.segmentResults,
        [segmentKey(segment, index)]: {
          ...emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: true,
        },
      },
    },
    ok: true,
    state: {
      ...nextState,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

export const applyResolvedQuantityMoveCardsSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment & { effect: MoveCardsEffect },
  index: number,
  quantity: number,
  ledgers: SegmentLedgers,
  emptySegmentResult: () => SequenceSegmentResult,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  if (
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > segment.effect.count
  ) {
    return { ok: false };
  }
  if (quantity === 0) {
    return {
      events: [],
      ledgers: {
        segmentResults: {
          ...ledgers.segmentResults,
          [segmentKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
          },
        },
        savedReferences: ledgers.savedReferences,
      },
      ok: true,
      state,
    };
  }
  const resolvedEffect: MoveCardsEffect = {
    type: "moveCards",
    count: quantity,
    from: segment.effect.from,
    to: segment.effect.to,
    order: segment.effect.order,
    ...(segment.effect.destinationState === undefined
      ? {}
      : { destinationState: segment.effect.destinationState }),
  };
  return applyMoveCardsSegment(
    state,
    entry,
    { ...segment, effect: resolvedEffect },
    index,
    ledgers,
    emptySegmentResult,
    segmentKey,
  );
};

export const applyResolvedQuantityRevealTopSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment & { effect: RevealTopEffect },
  index: number,
  quantity: number,
  ledgers: SegmentLedgers,
  emptySegmentResult: () => SequenceSegmentResult,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const revealedPlayerId = resolvePlayerId(state, entry, segment.effect.player);
  if (
    revealedPlayerId === undefined ||
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > segment.effect.count
  ) {
    return { ok: false };
  }
  const player = state.players[revealedPlayerId];
  if (player === undefined) {
    return { ok: false };
  }
  const sourceZone = segment.effect.zone ?? "deck";
  const sourceCards =
    sourceZone === "life"
      ? player.life.map((lifeCard) => lifeCard.card)
      : player.deck;
  const revealedCards = sourceCards
    .slice(0, quantity)
    .map((card) => toCardRef(card, revealedPlayerId));
  const revealId = `reveal:sequence:${String(entry.id)}:${String(index)}`;
  const visibility = revealTopVisibility(
    segment.effect.visibility,
    entry.controllerId,
  );
  const origin =
    sourceZone === "life"
      ? ({ zone: "life", playerId: revealedPlayerId } as const)
      : ("topOfDeck" as const);
  const events: EngineEvent[] = [];
  if (revealedCards.length > 0) {
    appendEvent(
      state,
      events,
      "cardRevealed",
      {
        revealId,
        cards: revealedCards,
        origin,
        selectionSetId: segment.effect.saveAs,
      },
      visibility,
    );
    const event = events[0];
    if (event !== undefined) {
      event.causedBy = {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      };
    }
  }
  const nextSeq = toStateSeq(state.seq + 1);
  const nextState =
    revealedCards.length === 0
      ? state
      : {
          ...state,
          seq: nextSeq,
          revealedCards: [
            ...state.revealedCards,
            {
              id: revealId,
              cards: revealedCards,
              visibility,
              origin,
              selectionSetId: String(segment.effect.saveAs),
              createdAtStateSeq: nextSeq,
              cleanupPolicy: "returnToOrigin" as const,
            },
          ],
          eventJournal: [...state.eventJournal, ...events],
        };
  return {
    events,
    ledgers: {
      ...ledgers,
      savedReferences: {
        ...ledgers.savedReferences,
        [segment.effect.saveAs]: {
          kind: "selectedCards",
          cards: revealedCards,
        },
      },
      segmentResults: {
        ...ledgers.segmentResults,
        [segmentKey(segment, index)]: {
          ...emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: revealedCards.length > 0,
          selectedCards: revealedCards,
        },
      },
    },
    ok: true,
    state: nextState,
  };
};

export const applyRevealTopSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment & { effect: RevealTopEffect },
  index: number,
  ledgers: SegmentLedgers,
  emptySegmentResult: () => SequenceSegmentResult,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
) =>
  applyResolvedQuantityRevealTopSegment(
    state,
    entry,
    segment,
    index,
    segment.effect.count,
    ledgers,
    emptySegmentResult,
    segmentKey,
  );

export const resolvingEntryFor = (
  entry: EffectQueueEntry,
): EffectQueueEntry => ({
  ...entry,
  state: "resolving",
});

export const replaceQueueEntry = (
  state: GameState,
  entry: EffectQueueEntry,
): GameState => ({
  ...state,
  effectQueue: state.effectQueue.map((candidate) =>
    candidate.id === entry.id ? entry : candidate,
  ),
});

export const removeFrame = (
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

export const activeDonCount = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
): number =>
  state.players[playerId]?.costArea.filter((card) => card.state === "active")
    .length ?? 0;

export const previousSegmentSucceeded = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  index: number,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
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

export const previousSegmentCompleted = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  index: number,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
): boolean => {
  const previous = effect.effects[index - 1];
  if (previous === undefined) {
    return false;
  }
  const result = segmentResults[segmentKey(previous, index - 1)];
  return result !== undefined && result.attempted && result.succeeded;
};

const previousSegmentNotSucceeded = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  index: number,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
): boolean => {
  const previous = effect.effects[index - 1];
  if (previous === undefined) {
    return false;
  }
  const result = segmentResults[segmentKey(previous, index - 1)];
  return result !== undefined && result.attempted && !result.succeeded;
};

export const shouldAttemptSegment = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  index: number,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
): boolean => {
  const segment = effect.effects[index];
  if (segment === undefined) {
    return false;
  }
  if (segment.connector === "always") {
    return true;
  }
  if (segment.connector === "then") {
    return previousSegmentCompleted(segmentResults, effect, index, segmentKey);
  }
  if (segment.connector === "ifPreviousNotSucceeded") {
    return previousSegmentNotSucceeded(
      segmentResults,
      effect,
      index,
      segmentKey,
    );
  }
  return previousSegmentSucceeded(segmentResults, effect, index, segmentKey);
};

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

export const saveReference = (
  savedReferences: EffectExecutionFrame["savedReferences"],
  segment: SequenceEffect["effects"][number],
  reference: SequenceSavedResultReference,
): EffectExecutionFrame["savedReferences"] =>
  segment.saveResultAs === undefined
    ? savedReferences
    : { ...savedReferences, [segment.saveResultAs]: reference };

export const applyDrawSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment & { effect: DrawEffect },
  index: number,
  ledgers: SegmentLedgers,
  options: { incrementStateSeq: boolean },
  emptySegmentResult: () => SequenceSegmentResult,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
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
    {
      incrementStateSeq: options.incrementStateSeq,
    },
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

export const applyResolvedQuantityDrawSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SequenceEffect["effects"][number] & {
    effect: Extract<Effect, { type: "drawUpTo" }>;
  },
  index: number,
  quantity: number,
  ledgers: SegmentLedgers,
  emptySegmentResult: () => SequenceSegmentResult,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
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
  const resolution = executeDrawPrimitiveForResolvedQuantity(
    state,
    entry,
    segment.effect.player,
    quantity,
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
  const saveResultAs = segment.saveResultAs;
  const savedReferences =
    saveResultAs === undefined
      ? ledgers.savedReferences
      : saveReference(ledgers.savedReferences, segment, {
          kind: "producedObjects",
          objects: toSavedProducedObjects(
            {
              ...segment,
              saveResultAs,
              effect: { ...segment.effect, type: "draw" },
            },
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
