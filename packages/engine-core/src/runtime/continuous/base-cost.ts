import type { ContinuousEffectRecord, Effect, TargetSpec } from "@optcg/types";

export const toBaseCostSetModifier = (
  effect: Extract<Effect, { type: "setBaseCost" }>,
  target: TargetSpec,
): ContinuousEffectRecord["modifier"] => ({
  layer: "baseCostSet",
  target,
  operation: { type: "setBaseCost", value: effect.value },
});
