import type {
  EffectQueueEntry,
  EngineError,
  SequenceSegmentResult,
} from "@optcg/types";

import type { SequenceRuntimeFailureReason } from "./types.js";

interface SequenceRuntimeErrorDetails {
  reason: SequenceRuntimeFailureReason;
}

export const emptySegmentResult = (): SequenceSegmentResult => ({
  attempted: false,
  succeeded: false,
  changedState: false,
  selectedCards: [],
  selectedTargets: [],
  paidCost: false,
  playerDeclined: false,
});

export const sequenceRuntimeError = (
  effectId: EffectQueueEntry["effectBlockId"],
  reason: SequenceRuntimeFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SequenceRuntimeErrorDetails,
});
