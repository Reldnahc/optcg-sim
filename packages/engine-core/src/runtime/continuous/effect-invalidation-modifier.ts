import type { ContinuousEffectRecord, Effect } from "@optcg/types";

import { isSupportedDuration, isSupportedTarget } from "./support.js";

type InvalidateEffectsEffect = Extract<Effect, { type: "invalidateEffects" }>;

const unsupportedDerivedMessage = (reason: string): string =>
  `Unsupported continuous effect materialization: ${reason}.`;

export const isSupportedPermanentInvalidateEffects = (
  effect: InvalidateEffectsEffect,
): boolean =>
  isSupportedDuration(effect.duration) &&
  (effect.target.type === "myLeader" || isSupportedTarget(effect.target));

export const toInvalidateEffectsModifier = (
  effect: InvalidateEffectsEffect,
): ContinuousEffectRecord["modifier"] => {
  if (!isSupportedPermanentInvalidateEffects(effect)) {
    throw new TypeError(
      unsupportedDerivedMessage("unsupported effect invalidation shape"),
    );
  }
  return {
    layer: "effectInvalidation",
    target: effect.target,
    operation: { type: "invalidateEffects" },
  };
};
