import type {
  Effect,
  MultiZoneTargetRequest,
  Target,
  TargetRequest,
} from "@optcg/types";

import { isSupportedContinuousQueueEffect } from "./support.js";
import type { ContinuousQueueEffect } from "./types.js";

export type { ContinuousQueueEffect };

export type ContinuousEffectWithTarget = Extract<
  ContinuousQueueEffect,
  { target: Target }
>;

export type ContinuousTargetChoiceEffect = ContinuousEffectWithTarget & {
  target: Extract<Target, { type: "choose" | "chooseFromZones" }>;
};

export const isContinuousEffectWithTarget = (
  effect: ContinuousQueueEffect,
): effect is ContinuousEffectWithTarget => "target" in effect;

export const continuousChooseTargetRequest = (
  effect: ContinuousQueueEffect,
): TargetRequest | MultiZoneTargetRequest | undefined => {
  if (!isContinuousEffectWithTarget(effect)) {
    return undefined;
  }
  if (
    effect.target.type === "choose" ||
    effect.target.type === "chooseFromZones"
  ) {
    return effect.target.request;
  }
  return undefined;
};

export const hasSavedFieldObjectContinuousTarget = (
  effect: ContinuousQueueEffect,
): boolean =>
  isContinuousEffectWithTarget(effect) &&
  effect.target.type === "savedFieldObject";

export const isSupportedContinuousTargetChoiceEffect = (
  effect: Effect,
): effect is ContinuousTargetChoiceEffect =>
  isSupportedContinuousQueueEffect(effect) &&
  continuousChooseTargetRequest(effect) !== undefined;
