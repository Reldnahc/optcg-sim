import type {
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import {
  applySetLifeFaceUpSequenceSegment,
  createLifeReorderDecisionForSequenceSegment,
} from "../life-state.js";
import { pauseSequenceForPendingDecision } from "./pause.js";
import type {
  SegmentLedgers,
  SequenceEffect,
  SequenceFrameRunResult,
} from "./types.js";

type LifeStateSegmentResult =
  | {
      handled: false;
    }
  | {
      handled: true;
      result: SequenceFrameRunResult;
    };

export const applyLifeStateNoDecisionSegment = (params: {
  effectPath: readonly string[];
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  events: EngineEvent[];
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number];
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  state: GameState;
}): LifeStateSegmentResult => {
  if (params.segment.effect.type === "reorderLife") {
    const decision = createLifeReorderDecisionForSequenceSegment({
      effect: params.segment.effect,
      entry: params.entry,
      index: params.index,
      state: params.state,
    });
    if (!decision.ok) {
      return { handled: true, result: { ok: false } };
    }
    return {
      handled: true,
      result: pauseSequenceForPendingDecision({
        decisionEvents: decision.events,
        effectPath: [...params.effectPath],
        entry: params.entry,
        events: params.events,
        index: params.index,
        ledgers: params.ledgers,
        state: decision.state,
      }),
    };
  }
  if (params.segment.effect.type !== "setLifeFaceUp") {
    return { handled: false };
  }
  const applied = applySetLifeFaceUpSequenceSegment({
    effect: params.segment.effect,
    emptySegmentResult: params.emptySegmentResult,
    entry: params.entry,
    index: params.index,
    ledgers: params.ledgers,
    segment: params.segment,
    segmentKey: params.segmentKey,
    state: params.state,
  });
  if (!applied.ok) {
    return { handled: true, result: { ok: false } };
  }
  return {
    handled: true,
    result: {
      events: [],
      kind: "completed",
      ledgers: applied.ledgers,
      ok: true,
      state: applied.state,
    },
  };
};
