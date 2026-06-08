import type { EffectExecutionFrame } from "@optcg/types";

import { segmentKeyForPath } from "../paths.js";
import type { SequenceEffect } from "./types.js";

export const sequenceSegmentResultsChanged = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  effectPath: readonly string[],
): boolean =>
  effect.effects.some((segment, index) => {
    const result =
      segmentResults[segmentKeyForPath(effectPath, segment, index)];
    return (
      result !== undefined &&
      result.attempted &&
      result.succeeded &&
      result.changedState
    );
  });
