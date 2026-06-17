import type {
  CardRef,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import type { SupportedSequenceSegment } from "../../effect-runtime-sequence/support.js";
import { applyRuntimeActivateSelectedEvent } from "../../play-card/core.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegment = SequenceEffect["effects"][number];
type ActivateSelectedEventEffect = Extract<
  SequenceSegment["effect"],
  { type: "activateSelectedEvent" }
>;
type ActivateSelectedEventSegment = SequenceSegment & {
  effect: ActivateSelectedEventEffect;
};

type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

type ActivateSelectedEventSegmentResult = {
  events: EngineEvent[];
  kind: "continued";
  ledgers: SegmentLedgers;
  ok: true;
  state: GameState;
};

const failedResult = (
  emptySegmentResult: () => SequenceSegmentResult,
  selectedCards: readonly CardRef[],
  changedState = false,
): SequenceSegmentResult => ({
  ...emptySegmentResult(),
  attempted: true,
  changedState,
  selectedCards: [...selectedCards],
});

export const applyActivateSelectedEventSequenceSegment = (params: {
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  events: EngineEvent[];
  index: number;
  ledgers: SegmentLedgers;
  segment: SupportedSequenceSegment & ActivateSelectedEventSegment;
  segmentKey: (segment: SequenceSegment, index: number) => string;
  state: GameState;
}): ActivateSelectedEventSegmentResult => {
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
  const key = segmentKey(segment, index);
  const previousResult = nextLedgers.segmentResults[key];
  const auditedSelectedCards =
    previousResult !== undefined && previousResult.selectedCards.length > 0
      ? previousResult.selectedCards
      : selectedCards;

  if (saved === undefined || saved.kind !== "selectedCards") {
    return {
      events,
      kind: "continued",
      ledgers: {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [key]: { ...emptySegmentResult(), attempted: true },
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
        savedReferences: {
          ...nextLedgers.savedReferences,
          [segment.effect.selection]: { kind: "selectedCards", cards: [] },
        },
        segmentResults: {
          ...nextLedgers.segmentResults,
          [key]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: previousResult?.attempted === true,
            selectedCards: [...auditedSelectedCards],
          },
        },
      },
      ok: true,
      state: nextState,
    };
  }

  let changedState = previousResult?.attempted === true;
  const sourceZone = segment.effect.sourceZone ?? "hand";
  for (const selected of selectedCards) {
    if (
      selected.playerId !== entry.controllerId ||
      selected.zone?.zone !== sourceZone
    ) {
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [key]: failedResult(
            emptySegmentResult,
            auditedSelectedCards,
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

    const activated = applyRuntimeActivateSelectedEvent({
      state: nextState,
      playerId: entry.controllerId,
      cardInstanceId: selected.instanceId,
      sourceZone,
      ignoreCost: segment.effect.ignoreCost,
      causedBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
    });
    if (
      activated.errors !== undefined ||
      activated.state.pendingDecision !== undefined
    ) {
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [key]: failedResult(
            emptySegmentResult,
            auditedSelectedCards,
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

    nextState = activated.state;
    events.push(...activated.events);
    changedState = changedState || activated.events.length > 0;
  }

  nextLedgers = {
    ...nextLedgers,
    savedReferences: {
      ...nextLedgers.savedReferences,
      [segment.effect.selection]: { kind: "selectedCards", cards: [] },
    },
    segmentResults: {
      ...nextLedgers.segmentResults,
      [key]: {
        ...emptySegmentResult(),
        attempted: true,
        succeeded: true,
        changedState,
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
