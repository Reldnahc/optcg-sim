import type { ContinuousEffectRecord, Effect, Modifier } from "@optcg/types";

export type DonPhasePlacementEffect = Extract<
  Effect,
  { type: "redirectDonPhasePlacement" }
>;

export const isDonPhasePlacementEffect = (
  effect: Effect,
): effect is DonPhasePlacementEffect =>
  effect.type === "redirectDonPhasePlacement";

export const isSupportedDonPhasePlacementEffect = (
  effect: DonPhasePlacementEffect,
  options: { readonly supportsDuration: boolean },
): boolean =>
  effect.player === "self" &&
  Number.isSafeInteger(effect.count) &&
  effect.count > 0 &&
  effect.target.type === "myLeader" &&
  options.supportsDuration;

export const toDonPhasePlacementModifier = (
  effect: DonPhasePlacementEffect,
): Modifier => ({
  layer: "donPhasePlacement",
  target: effect.target,
  operation: {
    type: "redirectDonPhasePlacement",
    count: effect.count,
    player: effect.player,
  },
});

export const toSupportedDonPhasePlacementModifier = (
  effect: DonPhasePlacementEffect,
  options: { readonly supportsDuration: boolean },
): Modifier => {
  if (!isSupportedDonPhasePlacementEffect(effect, options)) {
    throw new TypeError(
      "Unsupported continuous effect materialization: unsupported DON phase placement shape.",
    );
  }
  return toDonPhasePlacementModifier(effect);
};

export const isDonPhasePlacementModifier = (
  record: ContinuousEffectRecord,
): boolean =>
  record.modifier.layer === "donPhasePlacement" &&
  record.modifier.operation.type === "redirectDonPhasePlacement" &&
  record.modifier.operation.player === "self" &&
  record.modifier.target.type === "myLeader" &&
  Number.isSafeInteger(record.modifier.operation.count) &&
  record.modifier.operation.count > 0;
