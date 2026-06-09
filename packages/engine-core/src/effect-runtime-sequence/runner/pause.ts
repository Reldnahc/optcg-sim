import type { EffectQueueEntry, EngineEvent, GameState } from "@optcg/types";

import {
  frameForPausedSequenceDecision,
  stateWithPausedSequenceFrame,
} from "../frame-decisions.js";
import type {
  SegmentLedgers,
  SequenceEffect,
  SequenceFrameRunResult,
} from "./types.js";

export const pauseSequenceForPendingDecision = (params: {
  decisionEvents: readonly EngineEvent[];
  effectPath: readonly string[];
  entry: EffectQueueEntry;
  events: readonly EngineEvent[];
  index: number;
  ledgers: SegmentLedgers;
  state: GameState;
}): SequenceFrameRunResult => {
  const decision = params.state.pendingDecision;
  if (decision === undefined) {
    return { ok: false };
  }
  const frame = frameForPausedSequenceDecision({
    decision,
    entry: params.entry,
    effectPath: [...params.effectPath],
    index: params.index,
    savedReferences: params.ledgers.savedReferences,
    segmentResults: params.ledgers.segmentResults,
    state: params.state,
  });
  return {
    events: [...params.events, ...params.decisionEvents],
    kind: "paused",
    ok: true,
    state: stateWithPausedSequenceFrame(params.state, params.entry, frame),
  };
};

export const noOpSegmentLedgers = (params: {
  emptySegmentResult: () => SegmentLedgers["segmentResults"][string];
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number];
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
}): SegmentLedgers => ({
  ...params.ledgers,
  segmentResults: {
    ...params.ledgers.segmentResults,
    [params.segmentKey(params.segment, params.index)]:
      params.emptySegmentResult(),
  },
});
