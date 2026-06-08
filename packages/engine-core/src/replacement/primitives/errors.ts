import type { EngineError } from "@optcg/types";

import type {
  SelectedTargetKoReplacementDetectionErrorDetails,
  SelectedTargetKoReplacementDetectionFailureReason,
} from "./types.js";

export const detectionError = (
  effectId: string,
  reason: SelectedTargetKoReplacementDetectionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: {
    reason,
  } satisfies SelectedTargetKoReplacementDetectionErrorDetails,
});

export const failure = (
  effectId: string,
  reason: SelectedTargetKoReplacementDetectionFailureReason,
): { ok: false; error: EngineError } => ({
  ok: false,
  error: detectionError(effectId, reason),
});
