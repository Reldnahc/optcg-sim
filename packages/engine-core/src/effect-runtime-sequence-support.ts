import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  PlaySelectedEffect,
  SelectTargetsEffect,
  SelectCardsEffect,
  Target,
} from "@optcg/types";

import { isSupportedSequenceHandSelectCardsEffect } from "./effect-runtime-hand-selection.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
type DrawEffect = Extract<Effect, { type: "draw" }>;
type DrawUpToEffect = Extract<Effect, { type: "drawUpTo" }>;
type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
type PayCostEffect = Extract<SequenceSegmentEffect, { type: "payCost" }>;
type KoEffect = Extract<Effect, { type: "ko" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};

export type SupportedSequenceSegment = SequenceEffect["effects"][number] & {
  effect:
    | DrawEffect
    | DrawUpToEffect
    | TrashFromHandEffect
    | PayCostEffect
    | SelectCardsEffect
    | SelectTargetsEffect
    | PlaySelectedEffect
    | KoEffect;
};

export type SupportedSequenceBlock = EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: SequenceEffect & { effects: SupportedSequenceSegment[] };
};

const isSupportedConnector = (
  connector: SequenceEffect["effects"][number]["connector"],
): connector is "always" | "then" | "ifPreviousSucceeded" | "ifYouDo" =>
  connector === "always" ||
  connector === "then" ||
  connector === "ifPreviousSucceeded" ||
  connector === "ifYouDo";

const isSupportedDrawSegment = (
  effect: SequenceSegmentEffect,
): effect is DrawEffect =>
  effect.type === "draw" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

const isSupportedDrawUpToSegment = (
  effect: SequenceSegmentEffect,
): effect is DrawUpToEffect =>
  effect.type === "drawUpTo" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

const isSupportedTrashFromHandSegment = (
  effect: SequenceSegmentEffect,
): effect is TrashFromHandEffect =>
  effect.type === "trashFromHand" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  effect.filter === undefined &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

const isSupportedPayCostSegment = (
  effect: SequenceSegmentEffect,
): effect is PayCostEffect =>
  effect.type === "payCost" &&
  (effect.cost.type === "restDon" || effect.cost.type === "returnDon") &&
  (effect.cost.chooser === undefined || effect.cost.chooser === "self") &&
  Number.isInteger(effect.cost.count) &&
  effect.cost.count > 0;

const isSupportedSavedFieldObjectKoTarget = (
  target: Target,
): target is Extract<Target, { type: "savedFieldObject" }> =>
  target.type === "savedFieldObject" &&
  target.zone === "characterArea" &&
  (target.player === "self" || target.player === "opponent") &&
  target.controller === undefined &&
  target.filter === undefined;

const isSupportedKoSegment = (
  effect: SequenceSegmentEffect,
): effect is KoEffect =>
  effect.type === "ko" && isSupportedSavedFieldObjectKoTarget(effect.target);

export const isSupportedSequenceBlock = (
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
): effectBlock is SupportedSequenceBlock => {
  if (
    effectBlock === undefined ||
    effectBlock.category !== "auto" ||
    effectBlock.optional === true ||
    effectBlock.cost !== undefined ||
    effectBlock.conditionTiming !== undefined ||
    effectBlock.failurePolicy !== undefined ||
    effectBlock.sourcePresencePolicy !== entry.sourcePresencePolicy ||
    effectBlock.effect.type !== "sequence" ||
    effectBlock.effect.effects.length === 0
  ) {
    return false;
  }

  let hasPendingDecisionSegment = false;
  const allSegmentsSupported = effectBlock.effect.effects.every(
    (segment, index) => {
      if (
        !isSupportedConnector(segment.connector) ||
        (index === 0 && segment.connector !== "always")
      ) {
        return false;
      }
      if (isSupportedDrawSegment(segment.effect)) {
        if (segment.optional === true) {
          hasPendingDecisionSegment = true;
        }
        return true;
      }
      if (isSupportedDrawUpToSegment(segment.effect)) {
        if (segment.optional === true) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedTrashFromHandSegment(segment.effect)) {
        if (index === 0) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedPayCostSegment(segment.effect)) {
        if (segment.optional === true) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedSequenceHandSelectCardsEffect(segment.effect)) {
        if (index === 0) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      if (segment.effect.type === "selectTargets") {
        const request = segment.effect.request;
        if (
          request.timing !== "onResolution" ||
          request.chooser !== "self" ||
          request.zone !== "characterArea" ||
          request.player !== "opponent" ||
          request.filter !== undefined ||
          !Number.isInteger(request.min) ||
          !Number.isInteger(request.max) ||
          request.min < 0 ||
          request.min > request.max ||
          request.allowFewerIfUnavailable
        ) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      if (segment.effect.type === "playSelected") {
        return (
          segment.effect.enterRested === true &&
          segment.effect.ignoreCost === true &&
          String(segment.effect.selection).startsWith("handSelection:")
        );
      }
      if (isSupportedKoSegment(segment.effect)) {
        return true;
      }
      return false;
    },
  );
  return allSegmentsSupported && hasPendingDecisionSegment;
};
