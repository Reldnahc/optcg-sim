import type { Duration, Effect } from "@optcg/types";

export const durationForDerivedEffect = (effect: Effect): Duration => {
  if (
    effect.type === "modifyPower" ||
    effect.type === "giveKeyword" ||
    effect.type === "giveAttribute" ||
    effect.type === "setBasePower" ||
    effect.type === "modifyCost" ||
    effect.type === "protectFromKO" ||
    effect.type === "cannotAttack" ||
    effect.type === "attackCost" ||
    effect.type === "cannotBlock" ||
    effect.type === "preventBlockerActivation" ||
    effect.type === "cannotBecomeActive" ||
    effect.type === "giveProtection"
  ) {
    return effect.duration;
  }

  return { type: "whileSourceOnField" };
};
