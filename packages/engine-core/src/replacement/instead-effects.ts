import type { Effect, Target } from "@optcg/types";

import { isSupportedHandSelectionCardFilter } from "../actions/state.js";
import { isSupportedLifeTopToHandEffect } from "../effect-runtime-move-cards.js";
import { flattenSequenceEffect } from "../effect-runtime-sequence/support-normalization.js";
import type { SelectedTargetKoReplacementCandidate } from "./primitives.js";

type ReplacementInstead =
  SelectedTargetKoReplacementCandidate["replacementEffect"]["instead"];
type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
type SelectTargetsEffect = Extract<Effect, { type: "selectTargets" }>;
type PayCostEffect = Extract<SequenceSegmentEffect, { type: "payCost" }>;

interface SupportedOwnerDeckBottomInstead {
  readonly count: number;
  readonly request: SelectTargetsEffect["request"];
}

export interface SupportedReplacementSequenceWithTrashFromHand {
  readonly prefix: ReadonlyArray<
    SequenceEffect["effects"][number] & { effect: Effect }
  >;
  readonly trashFromHand: Extract<
    ReplacementInstead,
    { type: "trashFromHand" }
  >;
}

export const plural = (
  count: number,
  singular: string,
  pluralLabel: string,
): string => (count === 1 ? singular : pluralLabel);

export const isSupportedRestOwnCardsInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "rest" }> & {
  target: Extract<
    Extract<ReplacementInstead, { type: "rest" }>["target"],
    { type: "chooseFromZones" }
  >;
} =>
  effect.type === "rest" &&
  effect.target.type === "chooseFromZones" &&
  effect.target.request.timing === "onResolution" &&
  effect.target.request.chooser === "self" &&
  effect.target.request.player === "self" &&
  isSupportedHandSelectionCardFilter(effect.target.request.filter) &&
  effect.target.request.min === effect.target.request.max &&
  effect.target.request.min > 0 &&
  !effect.target.request.allowFewerIfUnavailable &&
  effect.target.request.visibility === "public";

export const isSupportedRestSelfInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "rest" }> & {
  target: Extract<
    Extract<ReplacementInstead, { type: "rest" }>["target"],
    {
      type: "self";
    }
  >;
} => effect.type === "rest" && effect.target.type === "self";

export const isSupportedTrashFromHandInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "trashFromHand" }> =>
  effect.type === "trashFromHand" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  Number.isInteger(effect.count) &&
  effect.count > 0 &&
  effect.min === undefined;

export const isSupportedReturnDonInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "returnDon" }> =>
  effect.type === "returnDon" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

export const isSupportedModifyPowerInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "modifyPower" }> =>
  effect.type === "modifyPower" &&
  (effect.target.type === "myLeader" || effect.target.type === "self") &&
  typeof effect.value === "number" &&
  effect.duration.type === "thisTurn";

export const isSupportedTrashSelfInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "trash" }> & {
  target: Extract<
    Extract<ReplacementInstead, { type: "trash" }>["target"],
    {
      type: "self";
    }
  >;
} => effect.type === "trash" && effect.target.type === "self";

export const isSupportedKoSelfInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "ko" }> & {
  target: Extract<
    Extract<ReplacementInstead, { type: "ko" }>["target"],
    {
      type: "self";
    }
  >;
} => effect.type === "ko" && effect.target.type === "self";

export const isSupportedDrawInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "draw" }> =>
  effect.type === "draw" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

export const isSupportedLifeVisibilityInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "setLifeCardFaceUp" }> =>
  effect.type === "setLifeCardFaceUp" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

export const isSupportedReplacementTargetLifeInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "bounce" }> & {
  target: Extract<
    Extract<ReplacementInstead, { type: "bounce" }>["target"],
    { type: "replacementTarget" }
  >;
  destination: "lifeTop" | "lifeBottom";
} =>
  effect.type === "bounce" &&
  effect.target.type === "replacementTarget" &&
  (effect.destination === "lifeTop" || effect.destination === "lifeBottom");

export const isSupportedReturnSelfToHandInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "bounce" }> & {
  target: Extract<
    Extract<ReplacementInstead, { type: "bounce" }>["target"],
    { type: "self" }
  >;
  destination: "hand";
} =>
  effect.type === "bounce" &&
  effect.target.type === "self" &&
  effect.destination === "hand";

const isSupportedAtomicNoDecisionInsteadEffect = (
  effect: SequenceSegmentEffect,
): boolean =>
  (effect.type === "moveCards" && isSupportedLifeTopToHandEffect(effect)) ||
  (effect.type === "setLifeCardFaceUp" &&
    isSupportedLifeVisibilityInsteadEffect(effect)) ||
  (effect.type === "bounce" &&
    isSupportedReplacementTargetLifeInsteadEffect(effect)) ||
  (effect.type === "bounce" &&
    isSupportedReturnSelfToHandInsteadEffect(effect)) ||
  (effect.type === "rest" && isSupportedRestSelfInsteadEffect(effect)) ||
  (effect.type === "modifyPower" &&
    isSupportedModifyPowerInsteadEffect(effect)) ||
  (effect.type === "trash" && isSupportedTrashSelfInsteadEffect(effect)) ||
  (effect.type === "ko" && isSupportedKoSelfInsteadEffect(effect)) ||
  (effect.type === "draw" && isSupportedDrawInsteadEffect(effect));

export const isSupportedReplacementInsteadSequenceEffect = (
  effect: Effect,
): effect is SequenceEffect => {
  if (effect.type !== "sequence") {
    return false;
  }
  const flattened = flattenSequenceEffect(effect);
  return (
    flattened !== null &&
    flattened.effects.length > 0 &&
    flattened.effects.every(
      (segment, index) =>
        (index === 0
          ? segment.connector === "always"
          : segment.connector === "then" || segment.connector === "always") &&
        segment.optional !== true &&
        segment.saveResultAs === undefined &&
        isSupportedAtomicNoDecisionInsteadEffect(segment.effect),
    )
  );
};

export const supportedReplacementSequenceWithTrashFromHandInstead = (
  effect: Effect,
): SupportedReplacementSequenceWithTrashFromHand | undefined => {
  if (effect.type !== "sequence") {
    return undefined;
  }
  const flattened = flattenSequenceEffect(effect);
  if (flattened === null || flattened.effects.length < 2) {
    return undefined;
  }
  if (
    !flattened.effects.every(
      (segment, index) =>
        (index === 0
          ? segment.connector === "always"
          : segment.connector === "then" || segment.connector === "always") &&
        segment.optional !== true &&
        segment.saveResultAs === undefined,
    )
  ) {
    return undefined;
  }
  const last = flattened.effects.at(-1);
  if (
    last === undefined ||
    last.effect.type === "payCost" ||
    !isSupportedTrashFromHandInsteadEffect(last.effect)
  ) {
    return undefined;
  }
  const prefix = flattened.effects.slice(0, -1);
  if (
    prefix.length === 0 ||
    !prefix.every(
      (segment) =>
        segment.effect.type !== "payCost" &&
        isSupportedAtomicNoDecisionInsteadEffect(segment.effect),
    )
  ) {
    return undefined;
  }
  return {
    prefix: prefix as Array<
      SequenceEffect["effects"][number] & { effect: Effect }
    >,
    trashFromHand: last.effect,
  };
};

export const isSupportedReplacementSequenceWithTrashFromHandInsteadEffect = (
  effect: Effect,
): effect is SequenceEffect =>
  supportedReplacementSequenceWithTrashFromHandInstead(effect) !== undefined;

export const supportedReplacementPayCostInstead = (
  effect: Effect,
): PayCostEffect | undefined => {
  if (effect.type !== "sequence") {
    return undefined;
  }
  const flattened = flattenSequenceEffect(effect);
  if (flattened === null || flattened.effects.length !== 1) {
    return undefined;
  }
  const segment = flattened.effects[0];
  if (
    segment?.connector !== "always" ||
    segment.optional === true ||
    segment.saveResultAs !== undefined ||
    segment.effect.type !== "payCost"
  ) {
    return undefined;
  }
  const cost = segment.effect.cost;
  if (
    cost.type === "returnDon" ||
    (cost.type === "moveCards" &&
      cost.chooser === "self" &&
      cost.from.player === "self" &&
      cost.from.zone === "trash" &&
      cost.from.position === undefined &&
      cost.to.player === "self" &&
      cost.to.zone === "deck" &&
      cost.to.position === "bottom")
  ) {
    return segment.effect;
  }
  return undefined;
};

export const isSupportedReplacementPayCostInsteadEffect = (
  effect: Effect,
): effect is SequenceEffect =>
  supportedReplacementPayCostInstead(effect) !== undefined;

export const supportedOwnerDeckBottomInstead = (
  effect: Effect,
): SupportedOwnerDeckBottomInstead | undefined => {
  if (effect.type !== "sequence") {
    return undefined;
  }
  const flattened = flattenSequenceEffect(effect);
  if (flattened === null || flattened.effects.length !== 2) {
    return undefined;
  }
  const select = flattened.effects[0];
  const bounce = flattened.effects[1];
  if (
    select?.connector !== "always" ||
    select.saveResultAs === undefined ||
    select.effect.type !== "selectTargets" ||
    bounce?.connector !== "then" ||
    bounce.effect.type !== "bounce" ||
    bounce.effect.destination !== "deckBottom" ||
    bounce.effect.target.type !== "savedFieldObject"
  ) {
    return undefined;
  }
  const request = select.effect.request;
  if (!("zone" in request)) {
    return undefined;
  }
  const supported =
    request.timing === "onResolution" &&
    request.chooser === "self" &&
    request.player === "self" &&
    request.zone === "characterArea" &&
    request.min === request.max &&
    request.min > 0 &&
    !request.allowFewerIfUnavailable &&
    request.filter?.categories?.length === 1 &&
    request.filter.categories[0] === "character" &&
    bounce.effect.target.binding.family === "selectedTargets" &&
    bounce.effect.target.binding.saveResultAs === select.saveResultAs &&
    bounce.effect.target.zone === "characterArea" &&
    bounce.effect.target.player === "self";
  return supported ? { count: request.min, request } : undefined;
};

export const isSupportedOwnerDeckBottomInsteadEffect = (
  effect: Effect,
): effect is SequenceEffect =>
  supportedOwnerDeckBottomInstead(effect) !== undefined;

export const isSupportedOpponentEffectFieldRemovalInsteadEffect = (
  effect: Effect,
): boolean =>
  isSupportedLifeTopToHandEffect(effect) ||
  isSupportedRestOwnCardsInsteadEffect(effect) ||
  isSupportedRestSelfInsteadEffect(effect) ||
  isSupportedTrashFromHandInsteadEffect(effect) ||
  isSupportedReturnDonInsteadEffect(effect) ||
  isSupportedModifyPowerInsteadEffect(effect) ||
  isSupportedTrashSelfInsteadEffect(effect) ||
  isSupportedKoSelfInsteadEffect(effect) ||
  isSupportedDrawInsteadEffect(effect) ||
  isSupportedLifeVisibilityInsteadEffect(effect) ||
  isSupportedReplacementTargetLifeInsteadEffect(effect) ||
  isSupportedReturnSelfToHandInsteadEffect(effect) ||
  isSupportedReplacementInsteadSequenceEffect(effect) ||
  isSupportedReplacementSequenceWithTrashFromHandInsteadEffect(effect) ||
  isSupportedReplacementPayCostInsteadEffect(effect) ||
  isSupportedOwnerDeckBottomInsteadEffect(effect);

export const replacementOptionLabel = (
  candidate: SelectedTargetKoReplacementCandidate,
): string => {
  const instead = candidate.replacementEffect.instead;
  if (instead.type === "draw") {
    return `Draw ${String(instead.count)} ${plural(
      instead.count,
      "card",
      "cards",
    )} instead`;
  }
  if (isSupportedLifeTopToHandEffect(instead)) {
    return `Add ${String(instead.count)} ${plural(
      instead.count,
      "card",
      "cards",
    )} from Life to hand instead`;
  }
  if (isSupportedLifeVisibilityInsteadEffect(instead)) {
    return `Turn ${String(instead.count)} Life ${plural(
      instead.count,
      "card",
      "cards",
    )} ${instead.faceUp ? "face-up" : "face-down"} instead`;
  }
  if (isSupportedReplacementTargetLifeInsteadEffect(instead)) {
    return `Add that card to ${instead.destination === "lifeTop" ? "top" : "bottom"} Life instead`;
  }
  if (isSupportedRestOwnCardsInsteadEffect(instead)) {
    return `Rest ${String(instead.target.request.min)} ${plural(
      instead.target.request.min,
      "card",
      "cards",
    )} instead`;
  }
  if (isSupportedRestSelfInsteadEffect(instead)) {
    return "Rest this Character instead";
  }
  if (isSupportedTrashFromHandInsteadEffect(instead)) {
    return `Trash ${String(instead.count)} ${plural(
      instead.count,
      "card",
      "cards",
    )} from hand instead`;
  }
  if (isSupportedReturnDonInsteadEffect(instead)) {
    return `Return ${String(instead.count)} DON!! ${plural(
      instead.count,
      "card",
      "cards",
    )} instead`;
  }
  if (isSupportedModifyPowerInsteadEffect(instead)) {
    const targetLabel =
      instead.target.type === "myLeader" ? "your Leader" : "this Character";
    return `Give ${targetLabel} ${String(Number(instead.value))} power instead`;
  }
  if (isSupportedTrashSelfInsteadEffect(instead)) {
    return "Trash this Character instead";
  }
  if (isSupportedKoSelfInsteadEffect(instead)) {
    return "K.O. this Character instead";
  }
  if (isSupportedReplacementInsteadSequenceEffect(instead)) {
    return "Apply replacement effects instead";
  }
  const payCost = supportedReplacementPayCostInstead(instead);
  if (payCost?.cost.type === "moveCards") {
    return `Place ${String(payCost.cost.count)} ${plural(
      payCost.cost.count,
      "card",
      "cards",
    )} from trash at the bottom of your deck instead`;
  }
  if (isSupportedOwnerDeckBottomInsteadEffect(instead)) {
    const count = supportedOwnerDeckBottomInstead(instead)?.count ?? 1;
    return `Place ${String(count)} Character ${plural(
      count,
      "",
      "cards ",
    )}at the bottom of the owner's deck instead`;
  }
  return "Use replacement effect";
};

export const isSelfTarget = (
  target: Target,
): target is Extract<Target, { type: "self" }> => target.type === "self";
