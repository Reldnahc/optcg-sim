import type {
  Effect,
  MultiZoneTargetRequest,
  Target,
  TargetRequest,
} from "@optcg/types";

import { isSupportedPublicFieldTargetFilter } from "../support-filters.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];

export type SavedFieldObjectTrashEffect = Extract<Effect, { type: "trash" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};
export type AllTargetTrashEffect = Extract<Effect, { type: "trash" }> & {
  target: Extract<Target, { type: "all" }>;
};
export type TrashEffect = SavedFieldObjectTrashEffect | AllTargetTrashEffect;
export type RestEffect = Extract<Effect, { type: "rest" }> & {
  target: Extract<
    Target,
    | { type: "choose" }
    | { type: "chooseFromZones" }
    | { type: "opponentLeader" }
    | { type: "savedFieldObject" }
  >;
};
export type ActivateEffect = Extract<Effect, { type: "activate" }> & {
  target: Extract<
    Target,
    | { type: "savedFieldObject" }
    | { type: "myLeader" }
    | { type: "all" }
    | { type: "self" }
  >;
};
export type SavedFieldObjectKoEffect = Extract<Effect, { type: "ko" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};
export type AllTargetKoEffect = Extract<Effect, { type: "ko" }> & {
  target: Extract<Target, { type: "all" }>;
};
export type KoEffect = SavedFieldObjectKoEffect | AllTargetKoEffect;
export type BounceEffect = Extract<Effect, { type: "bounce" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
  destination: "deckBottom" | "hand";
};
export type ChangeAttackTargetEffect = Extract<
  Effect,
  { type: "changeAttackTarget" }
> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};

export const isSupportedSavedFieldObjectKoTarget = (
  target: Target,
): target is Extract<Target, { type: "savedFieldObject" }> =>
  target.type === "savedFieldObject" &&
  (target.zone === "characterArea" || target.zone === "stageArea") &&
  target.zones === undefined &&
  (target.player === "self" ||
    target.player === "opponent" ||
    target.player === "anyPlayer") &&
  target.controller === undefined &&
  target.filter === undefined;

export const isSupportedSavedLeaderOrCharacterTarget = (
  target: Target,
): target is Extract<Target, { type: "savedFieldObject" }> =>
  target.type === "savedFieldObject" &&
  (target.zone === "leaderArea" ||
    target.zone === "characterArea" ||
    target.zones?.every(
      (zone) => zone === "leaderArea" || zone === "characterArea",
    ) === true) &&
  (target.player === "self" ||
    target.player === "opponent" ||
    target.player === "anyPlayer") &&
  target.controller === undefined &&
  target.filter === undefined;

export const isSupportedKoSegment = (
  effect: SequenceSegmentEffect,
): effect is KoEffect =>
  effect.type === "ko" &&
  (isSupportedSavedFieldObjectKoTarget(effect.target) ||
    (effect.target.type === "all" &&
      effect.target.zone === "characterArea" &&
      (effect.target.player === "self" ||
        effect.target.player === "opponent") &&
      isSupportedPublicFieldTargetFilter(effect.target.filter)));

export const isSupportedBounceSegment = (
  effect: SequenceSegmentEffect,
): effect is BounceEffect =>
  effect.type === "bounce" &&
  (effect.destination === "hand" || effect.destination === "deckBottom") &&
  isSupportedSavedFieldObjectKoTarget(effect.target);

export const isSupportedSequenceTargetRequest = (
  request:
    | Extract<Effect, { type: "selectTargets" }>["request"]
    | TargetRequest
    | MultiZoneTargetRequest,
): boolean => {
  const zones: readonly string[] =
    "zones" in request ? request.zones : [request.zone];
  const maxSupportedTargetCount = zones.includes("costArea") ? 10 : 5;
  return (
    request.timing === "onResolution" &&
    request.chooser === "self" &&
    zones.every(
      (zone) =>
        zone === "leaderArea" ||
        zone === "characterArea" ||
        zone === "stageArea" ||
        zone === "costArea",
    ) &&
    (request.player === "self" ||
      request.player === "opponent" ||
      request.player === "anyPlayer") &&
    Number.isInteger(request.min) &&
    Number.isInteger(request.max) &&
    request.min >= 0 &&
    request.min <= request.max &&
    request.max <= maxSupportedTargetCount &&
    isSupportedPublicFieldTargetFilter(request.filter)
  );
};

export const isSupportedAllFieldTrashSegment = (
  effect: SequenceSegmentEffect,
): effect is AllTargetTrashEffect =>
  effect.type === "trash" &&
  effect.target.type === "all" &&
  (effect.target.zone === "characterArea" ||
    effect.target.zone === "stageArea") &&
  (effect.target.player === "self" || effect.target.player === "opponent") &&
  isSupportedPublicFieldTargetFilter(effect.target.filter);

export const isSupportedTrashSegment = (
  effect: SequenceSegmentEffect,
): effect is TrashEffect =>
  effect.type === "trash" &&
  (isSupportedAllFieldTrashSegment(effect) ||
    isSupportedSavedFieldObjectKoTarget(effect.target));

export const isSupportedRestSegment = (
  effect: SequenceSegmentEffect,
): effect is RestEffect =>
  effect.type === "rest" &&
  (effect.target.type === "opponentLeader" ||
    isSupportedSavedFieldObjectKoTarget(effect.target) ||
    ((effect.target.type === "choose" ||
      effect.target.type === "chooseFromZones") &&
      isSupportedSequenceTargetRequest(effect.target.request)));

export const isSupportedActivateSegment = (
  effect: SequenceSegmentEffect,
): effect is Extract<SequenceSegmentEffect, { type: "activate" }> =>
  effect.type === "activate" &&
  ((effect.target.type === "savedFieldObject" &&
    (effect.target.zone === "costArea" ||
      effect.target.zone === "characterArea") &&
    (effect.target.player === "self" || effect.target.player === "opponent") &&
    effect.target.controller === undefined &&
    effect.target.filter === undefined &&
    effect.target.binding.family === "selectedTargets") ||
    effect.target.type === "myLeader" ||
    effect.target.type === "self" ||
    (effect.target.type === "all" &&
      effect.target.player === "self" &&
      effect.target.zone === "characterArea" &&
      isSupportedPublicFieldTargetFilter(effect.target.filter)));

export const isSupportedChangeAttackTargetSegment = (
  effect: SequenceSegmentEffect,
): effect is ChangeAttackTargetEffect =>
  effect.type === "changeAttackTarget" &&
  isSupportedSavedLeaderOrCharacterTarget(effect.target) &&
  effect.target.binding.family === "selectedTargets";
