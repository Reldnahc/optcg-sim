import type {
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import { createOptionalActivationDecisionForSequenceSegment } from "../frame-decisions.js";
import { pauseSequenceForPendingDecision } from "./pause.js";
import type {
  SegmentLedgers,
  SequenceEffect,
  SequenceFrameRunResult,
} from "./types.js";

export const pauseForOptionalSequenceSegment = (params: {
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
}): SequenceFrameRunResult => {
  const pausedLedgers: SegmentLedgers = {
    ...params.ledgers,
    segmentResults: {
      ...params.ledgers.segmentResults,
      [params.segmentKey(params.segment, params.index)]: {
        ...params.emptySegmentResult(),
        attempted: true,
      },
    },
  };
  const optionalDecision = createOptionalActivationDecisionForSequenceSegment(
    params.state,
    params.entry,
    params.index,
  );
  return pauseSequenceForPendingDecision({
    decisionEvents: optionalDecision.events,
    effectPath: [...params.effectPath],
    entry: params.entry,
    events: params.events,
    index: params.index,
    ledgers: pausedLedgers,
    state: optionalDecision.state,
  });
};
