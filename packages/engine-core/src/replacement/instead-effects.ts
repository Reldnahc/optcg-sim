import type { Effect, Target } from "@optcg/types";

import { isSupportedHandSelectionCardFilter } from "../actions/state.js";
import { isSupportedLifeTopToHandEffect } from "../effect-runtime-move-cards.js";
import type { SelectedTargetKoReplacementCandidate } from "./primitives.js";

type ReplacementInstead =
  SelectedTargetKoReplacementCandidate["replacementEffect"]["instead"];

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
  effect.target.request.filter === undefined &&
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
  effect.count > 0;

export const isSupportedReturnDonInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "returnDon" }> =>
  effect.type === "returnDon" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

export const isSupportedModifyLeaderPowerInsteadEffect = (
  effect: ReplacementInstead,
): effect is Extract<ReplacementInstead, { type: "modifyPower" }> =>
  effect.type === "modifyPower" &&
  effect.target.type === "myLeader" &&
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

export const isSupportedOpponentEffectFieldRemovalInsteadEffect = (
  effect: Effect,
): boolean =>
  isSupportedLifeTopToHandEffect(effect) ||
  isSupportedRestOwnCardsInsteadEffect(effect) ||
  isSupportedRestSelfInsteadEffect(effect) ||
  isSupportedTrashFromHandInsteadEffect(effect) ||
  isSupportedReturnDonInsteadEffect(effect) ||
  isSupportedModifyLeaderPowerInsteadEffect(effect) ||
  isSupportedTrashSelfInsteadEffect(effect);

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
  if (isSupportedModifyLeaderPowerInsteadEffect(instead)) {
    return `Give your Leader ${String(Number(instead.value))} power instead`;
  }
  if (isSupportedTrashSelfInsteadEffect(instead)) {
    return "Trash this Character instead";
  }
  return "Use replacement effect";
};

export const isSelfTarget = (
  target: Target,
): target is Extract<Target, { type: "self" }> => target.type === "self";
