import type {
  CardRef,
  ContinuousEffectRecord,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import { createContinuousRecordForExactTarget } from "../../runtime/continuous/exact-target.js";
import { isSupportedResolvedTargetContinuousEffect } from "../../runtime/continuous/resolved-target.js";
import type { SupportedSequenceSegment } from "../support.js";

export const continuousRecordForSavedObject = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment,
  target: CardRef,
  objectIndex: number,
): ContinuousEffectRecord | undefined => {
  if (
    segment.effect.type === "payCost" ||
    !isSupportedResolvedTargetContinuousEffect(segment.effect)
  ) {
    return undefined;
  }
  return (
    createContinuousRecordForExactTarget(
      state,
      entry,
      segment.effect,
      target,
      objectIndex,
      segment.id ?? objectIndex,
    ) ?? undefined
  );
};
