import type { Duration, Effect, Target } from "@optcg/types";

import { isSupportedContinuousQueueEffect } from "../../runtime/continuous/continuous.js";
import {
  isSupportedResolvedTargetContinuousEffect,
  type ResolvedTargetContinuousEffect,
} from "../../runtime/continuous/resolved-target.js";
import { isSourceDependentContinuousQueueEffect } from "../../runtime/continuous/support.js";
import { isSupportedQueuedEffectConditionShape } from "../../effect-runtime-conditions.js";
import {
  isSupportedSavedFieldObjectKoTarget,
  isSupportedSavedLeaderOrCharacterTarget,
} from "./field.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];

export type DirectContinuousEffect = Extract<
  Effect,
  {
    type:
      | "modifyPower"
      | "giveKeyword"
      | "giveAttribute"
      | "setBasePower"
      | "modifyCost"
      | "modifyCounter"
      | "preventDraw"
      | "preventDonActivation"
      | "preventPlay"
      | "invalidateEffects"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "attackCost"
      | "cannotBlock"
      | "preventBlockerActivation";
  }
>;
export type ConditionalContinuousEffect = Extract<
  Effect,
  { type: "conditional" }
> & {
  then:
    | Extract<Effect, { type: "modifyPower" }>
    | Extract<Effect, { type: "preventDonActivation" }>
    | Extract<Effect, { type: "preventPlay" }>
    | Extract<Effect, { type: "invalidateEffects" }>
    | Extract<Effect, { type: "cannotBecomeActive" }>
    | Extract<Effect, { type: "cannotAttack" }>
    | Extract<Effect, { type: "attackCost" }>
    | Extract<Effect, { type: "cannotBlock" }>
    | Extract<Effect, { type: "preventBlockerActivation" }>;
};
export type SavedTargetContinuousEffect = ResolvedTargetContinuousEffect & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};
export type SwapBasePowerEffect = Extract<Effect, { type: "swapBasePower" }>;

export const isSupportedSequenceContinuousDuration = (
  duration: Duration,
): boolean =>
  duration.type === "thisBattle" ||
  duration.type === "thisTurn" ||
  duration.type === "whileSourceOnField" ||
  duration.type === "permanent" ||
  duration.type === "untilEndOfNextTurn" ||
  duration.type === "untilStartOfNextTurn" ||
  duration.type === "untilEndOfTurn";

export const isSourceDependentContinuousSegment = (
  effect: SequenceSegmentEffect,
): boolean =>
  effect.type !== "payCost" &&
  isSupportedContinuousQueueEffect(effect) &&
  isSourceDependentContinuousQueueEffect(effect);

const isSupportedSavedContinuousTarget = (
  target: Target,
): target is Extract<Target, { type: "savedFieldObject" }> =>
  isSupportedSavedLeaderOrCharacterTarget(target) ||
  isSupportedSavedFieldObjectKoTarget(target);

export const isSupportedSavedTargetContinuousSegment = (
  effect: SequenceSegmentEffect,
): effect is SavedTargetContinuousEffect =>
  effect.type !== "payCost" &&
  isSupportedResolvedTargetContinuousEffect(effect) &&
  isSupportedSavedContinuousTarget(effect.target) &&
  isSupportedSequenceContinuousDuration(effect.duration);

export const isSupportedConditionalContinuousSegment = (
  effect: SequenceSegmentEffect,
): effect is ConditionalContinuousEffect =>
  effect.type === "conditional" &&
  effect.else === undefined &&
  isSupportedQueuedEffectConditionShape(effect.if) &&
  isSupportedContinuousQueueEffect(effect.then);

export const isSupportedSwapBasePowerSegment = (
  effect: SequenceSegmentEffect,
): effect is SwapBasePowerEffect =>
  effect.type === "swapBasePower" &&
  isSupportedSavedLeaderOrCharacterTarget(effect.left) &&
  isSupportedSavedLeaderOrCharacterTarget(effect.right) &&
  isSupportedSequenceContinuousDuration(effect.duration);
