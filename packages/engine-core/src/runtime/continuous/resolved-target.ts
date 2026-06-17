import type { Effect, Target } from "@optcg/types";

import { isSupportedContinuousQueueEffect } from "./support.js";
import type { ContinuousQueueEffect } from "./types.js";

type ResolvedTargetContinuousCandidate = Extract<
  ContinuousQueueEffect,
  {
    type:
      | "modifyPower"
      | "giveKeyword"
      | "giveAttribute"
      | "setPowerToZero"
      | "setBasePower"
      | "modifyCost"
      | "invalidateEffects"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "cannotAttackTarget"
      | "attackCost"
      | "cannotBlock"
      | "preventBlockerActivation";
  }
>;

export type ResolvedTargetContinuousEffect =
  ResolvedTargetContinuousCandidate & {
    target: Target;
  };

const isResolvedTargetContinuousCandidate = (
  effect: Effect,
): effect is ResolvedTargetContinuousCandidate =>
  effect.type === "modifyPower" ||
  effect.type === "giveKeyword" ||
  effect.type === "giveAttribute" ||
  effect.type === "setPowerToZero" ||
  effect.type === "setBasePower" ||
  effect.type === "modifyCost" ||
  effect.type === "invalidateEffects" ||
  effect.type === "cannotBecomeActive" ||
  effect.type === "cannotAttack" ||
  effect.type === "cannotAttackTarget" ||
  effect.type === "attackCost" ||
  effect.type === "cannotBlock" ||
  effect.type === "preventBlockerActivation";

export const isSupportedResolvedTargetContinuousEffect = (
  effect: Effect,
): effect is ResolvedTargetContinuousEffect => {
  if (!isResolvedTargetContinuousCandidate(effect)) {
    return false;
  }
  return isSupportedContinuousQueueEffect({
    ...effect,
    target: { type: "self" },
  });
};
