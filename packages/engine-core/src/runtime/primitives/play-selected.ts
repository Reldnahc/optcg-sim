import type {
  CardRef,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  PlayerId,
  PlayerRef,
  SavedFieldObjectReference,
  SelectCardsDecision,
  SequenceSegmentResult,
} from "@optcg/types";

import { toCardRef } from "../../actions/state.js";
import {
  frameForPausedSequenceDecision,
  stateWithPausedSequenceFrame,
} from "../../effect-runtime-sequence/frame-decisions.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SequenceFrameResumeResult,
} from "../../effect-runtime-sequence/frames.js";
import type { SupportedSequenceBlock } from "../../effect-runtime-sequence/support.js";
import {
  parseCharacterOverflowDecisionInstanceId,
  parseRuntimePlaySelectedOverflowDecisionInstanceId,
} from "../../play-card/legal-actions.js";
import { applyRuntimePlaySelected } from "../../play-card/core.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegment = SequenceEffect["effects"][number];
type PlaySelectedEffect = Extract<
  SequenceSegment["effect"],
  { type: "playSelected" }
>;
type PlaySelectedSegment = SequenceSegment & { effect: PlaySelectedEffect };

type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

type PlaySelectedSegmentResult =
  | {
      events: EngineEvent[];
      kind: "continued";
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | {
      events: EngineEvent[];
      kind: "paused";
      ok: true;
      state: GameState;
    };

type ResumePlaySelectedOverflowParams = {
  createUnsupportedTrashDecision: CreateTrashFromHandSequenceDecision;
  effectBlock: SupportedSequenceBlock;
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  frame: EffectExecutionFrame;
  resumeSequenceFrameFromLedgers: (params: {
    createTrashDecision: CreateTrashFromHandSequenceDecision;
    effectBlock: SupportedSequenceBlock;
    entry: EffectQueueEntry;
    finalizeCompleted: boolean;
    frame: EffectExecutionFrame;
    ledgers: SegmentLedgers;
    state: GameState;
  }) => SequenceFrameResumeResult;
  segmentKey: (segment: SequenceSegment, index: number) => string;
  sequenceRuntimeError: (
    effectId: EffectQueueEntry["effectBlockId"],
    reason: "unsupported-sequence-shape",
  ) => EngineError;
  state: GameState;
};

const isRuntimePlaySelectedOverflowDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is SelectCardsDecision =>
  decision.type === "selectCards" &&
  (parseCharacterOverflowDecisionInstanceId(decision.id) !== null ||
    parseRuntimePlaySelectedOverflowDecisionInstanceId(decision.id) !== null);

const failedResult = (
  emptySegmentResult: () => SequenceSegmentResult,
  selectedCards: readonly CardRef[],
  affectedCards: readonly CardRef[] = [],
  changedState = false,
): SequenceSegmentResult => ({
  ...emptySegmentResult(),
  attempted: true,
  changedState,
  affectedCards: [...affectedCards],
  selectedCards: [...selectedCards],
});

const findProducedPublicFieldObject = (
  state: GameState,
  playerId: PlayerId,
  instanceId: CardRef["instanceId"],
): CardRef | null => {
  const player = state.players[playerId];
  if (player === undefined) {
    return null;
  }
  const character = player.characters.find(
    (card) => card.instanceId === instanceId,
  );
  if (character !== undefined) {
    return toCardRef(character, playerId);
  }
  if (player.stage?.instanceId === instanceId) {
    return toCardRef(player.stage, playerId);
  }
  return null;
};

const resolvePlaySelectedPlayer = (
  state: GameState,
  entry: EffectQueueEntry,
  player: PlayerRef | undefined,
): PlayerId | null => {
  if (player === undefined || player === "self") {
    return entry.controllerId;
  }
  if (player !== "opponent") {
    return null;
  }
  const opponentId = Object.keys(state.players).find(
    (playerId) => playerId !== entry.controllerId,
  );
  return opponentId === undefined ? null : (opponentId as PlayerId);
};

export const applyPlaySelectedSequenceSegment = (params: {
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  events: EngineEvent[];
  index: number;
  ledgers: SegmentLedgers;
  segment: PlaySelectedSegment;
  segmentKey: (segment: SequenceSegment, index: number) => string;
  state: GameState;
}): PlaySelectedSegmentResult => {
  const {
    emptySegmentResult,
    entry,
    events,
    index,
    ledgers,
    segment,
    segmentKey,
  } = params;
  let nextState = params.state;
  let nextLedgers = ledgers;
  const saved = nextLedgers.savedReferences[segment.effect.selection];
  const selectedCards = saved?.kind === "selectedCards" ? saved.cards : [];
  const actorPlayerId = resolvePlaySelectedPlayer(
    nextState,
    entry,
    segment.effect.player,
  );
  if (actorPlayerId === null) {
    return {
      events,
      kind: "continued",
      ledgers: nextLedgers,
      ok: true,
      state: nextState,
    };
  }
  const key = segmentKey(segment, index);
  const previousResult = nextLedgers.segmentResults[key];
  const auditedSelectedCards =
    previousResult !== undefined && previousResult.selectedCards.length > 0
      ? previousResult.selectedCards
      : selectedCards;
  const priorAffectedCards = previousResult?.affectedCards ?? [];
  if (saved === undefined || saved.kind !== "selectedCards") {
    return {
      events,
      kind: "continued",
      ledgers: {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [key]: {
            ...emptySegmentResult(),
            attempted: true,
          },
        },
      },
      ok: true,
      state: nextState,
    };
  }
  if (selectedCards.length === 0) {
    return {
      events,
      kind: "continued",
      ledgers: {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [key]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: previousResult?.attempted === true,
            affectedCards: [...priorAffectedCards],
            selectedCards: [...auditedSelectedCards],
          },
        },
      },
      ok: true,
      state: nextState,
    };
  }

  let remaining = [...selectedCards];
  let changedState = previousResult?.attempted === true;
  const producedObjects: CardRef[] = [];
  for (const selected of selectedCards) {
    if (
      selected.playerId !== actorPlayerId ||
      (selected.zone?.zone !== "hand" &&
        selected.zone?.zone !== "trash" &&
        selected.zone?.zone !== "deck")
    ) {
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [key]: failedResult(
            emptySegmentResult,
            auditedSelectedCards,
            priorAffectedCards,
            changedState,
          ),
        },
      };
      return {
        events,
        kind: "continued",
        ledgers: nextLedgers,
        ok: true,
        state: nextState,
      };
    }
    const played = applyRuntimePlaySelected({
      state: nextState,
      playerId: actorPlayerId,
      cardInstanceId: selected.instanceId,
      sourceZone: selected.zone.zone,
      enterRested: segment.effect.enterRested === true,
      ignoreCost: true,
      effectSourceCardId: entry.source.cardId,
      causedBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
    });
    if (played.errors !== undefined) {
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [key]: failedResult(
            emptySegmentResult,
            auditedSelectedCards,
            priorAffectedCards,
            changedState,
          ),
        },
      };
      return {
        events,
        kind: "continued",
        ledgers: nextLedgers,
        ok: true,
        state: nextState,
      };
    }
    remaining = remaining.slice(1);
    if (played.state.pendingDecision !== undefined) {
      if (
        !isRuntimePlaySelectedOverflowDecision(played.state.pendingDecision)
      ) {
        return {
          events,
          kind: "continued",
          ledgers: nextLedgers,
          ok: true,
          state: nextState,
        };
      }
      const frame = frameForPausedSequenceDecision({
        decision: played.state.pendingDecision,
        entry,
        index,
        savedReferences: {
          ...nextLedgers.savedReferences,
          [segment.effect.selection]: {
            kind: "selectedCards",
            cards: [...remaining],
          },
        },
        segmentResults: {
          ...nextLedgers.segmentResults,
          [key]: failedResult(
            emptySegmentResult,
            auditedSelectedCards,
            [...priorAffectedCards, ...producedObjects],
            changedState,
          ),
        },
        state: played.state,
      });
      return {
        events: [...events, ...played.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(played.state, entry, frame),
      };
    }
    nextState = played.state;
    events.push(...played.events);
    changedState = changedState || played.events.length > 0;
    const producedObject = findProducedPublicFieldObject(
      nextState,
      actorPlayerId,
      selected.instanceId,
    );
    if (producedObject !== null) {
      producedObjects.push(producedObject);
    }
  }

  const saveResultAs = segment.saveResultAs;
  const savedReferences =
    saveResultAs === undefined || producedObjects.length === 0
      ? nextLedgers.savedReferences
      : {
          ...nextLedgers.savedReferences,
          [saveResultAs]: {
            kind: "producedObjects" as const,
            objects: producedObjects.map(
              (object, objectIndex): SavedFieldObjectReference => ({
                binding: {
                  family: "producedObjects",
                  saveResultAs,
                  objectIndex,
                  ...(segment.id === undefined
                    ? {}
                    : { sourceSegmentId: segment.id }),
                },
                capturedAtStateSeq: nextState.seq,
                object,
                visibility: "public",
              }),
            ),
          },
        };
  nextLedgers = {
    ...nextLedgers,
    savedReferences: {
      ...savedReferences,
      [segment.effect.selection]: { kind: "selectedCards", cards: [] },
    },
    segmentResults: {
      ...nextLedgers.segmentResults,
      [key]: {
        ...emptySegmentResult(),
        attempted: true,
        succeeded: true,
        changedState,
        affectedCards: [...priorAffectedCards, ...producedObjects],
        selectedCards: [...auditedSelectedCards],
      },
    },
  };
  return {
    events,
    kind: "continued",
    ledgers: nextLedgers,
    ok: true,
    state: nextState,
  };
};

export const resumePlaySelectedOverflowFrame = (
  params: ResumePlaySelectedOverflowParams,
): SequenceFrameResumeResult => {
  const {
    createUnsupportedTrashDecision,
    effectBlock,
    emptySegmentResult,
    entry,
    frame,
    resumeSequenceFrameFromLedgers,
    segmentKey,
    sequenceRuntimeError,
    state,
  } = params;
  const pausedSegment =
    effectBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    pausedSegment.effect.type !== "playSelected"
  ) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const playSelectedSegment: PlaySelectedSegment = {
    ...pausedSegment,
    effect: pausedSegment.effect,
  };
  const continued = applyPlaySelectedSequenceSegment({
    emptySegmentResult,
    entry,
    events: [],
    index: frame.pendingDecision.resumeAtSegmentIndex,
    ledgers: {
      savedReferences: frame.savedReferences,
      segmentResults: frame.segmentResults,
    },
    segment: playSelectedSegment,
    segmentKey,
    state,
  });
  if (continued.kind === "paused") {
    return {
      events: continued.events,
      ok: true,
      state: continued.state,
    };
  }
  return resumeSequenceFrameFromLedgers({
    createTrashDecision: createUnsupportedTrashDecision,
    effectBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: continued.ledgers,
    state: continued.state,
  });
};
