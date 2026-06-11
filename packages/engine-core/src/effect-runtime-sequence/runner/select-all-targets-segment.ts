import type {
  Effect,
  EffectQueueEntry,
  GameState,
  SavedFieldObjectReference,
} from "@optcg/types";

import { resolvePublicTargetCandidatesForRequest } from "../../selection/candidates.js";
import { saveReference } from "../segments.js";
import { emptySegmentResult } from "./results.js";
import type { SegmentLedgers, SequenceEffect } from "./types.js";

export const applySelectAllTargetsSegment = (params: {
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number] & {
    effect: Extract<Effect, { type: "selectAllTargets" }>;
  };
  segmentKey: string;
  state: GameState;
}):
  | {
      ledgers: SegmentLedgers;
      ok: true;
    }
  | { ok: false } => {
  const request = {
    ...params.segment.effect.request,
    min: 0,
    max: 0,
    allowFewerIfUnavailable: false,
  };
  const candidates = resolvePublicTargetCandidatesForRequest(
    params.state,
    request,
    { sourceControllerId: params.entry.controllerId },
  );
  if (!candidates.ok) {
    return { ok: false };
  }
  const selectedTargets = candidates.candidates.map(
    (candidate) => candidate.card,
  );
  const saveResultAs = params.segment.saveResultAs;
  const savedTargets =
    saveResultAs === undefined
      ? []
      : selectedTargets.map(
          (object, objectIndex): SavedFieldObjectReference => ({
            binding: {
              family: "selectedTargets",
              saveResultAs,
              objectIndex,
              ...(params.segment.id === undefined
                ? {}
                : { sourceSegmentId: params.segment.id }),
            },
            capturedAtStateSeq: params.state.seq,
            object,
            visibility: "public",
          }),
        );
  return {
    ledgers: {
      savedReferences:
        saveResultAs === undefined
          ? params.ledgers.savedReferences
          : saveReference(params.ledgers.savedReferences, params.segment, {
              kind: "selectedTargets",
              targets: savedTargets,
            }),
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey]: {
          ...emptySegmentResult(),
          attempted: true,
          succeeded: true,
          selectedTargets,
        },
      },
    },
    ok: true,
  };
};
