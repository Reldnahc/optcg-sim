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

export const isSupportedOwnerDeckBottomInsteadEffect = (
  effect: Effect,
): effect is Extract<Effect, { type: "sequence" }> => {
  if (effect.type !== "sequence" || effect.effects.length !== 2) {
    return false;
  }
  const select = effect.effects[0];
  const bounce = effect.effects[1];
  if (
    select?.connector !== "always" ||
    select.saveResultAs === undefined ||
    select.effect.type !== "selectTargets" ||
    bounce?.connector !== "then" ||
    bounce.effect.type !== "bounce" ||
    bounce.effect.destination !== "deckBottom" ||
    bounce.effect.target.type !== "savedFieldObject"
  ) {
    return false;
  }
  const request = select.effect.request;
  if (!("zone" in request)) {
    return false;
  }
  return (
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
    bounce.effect.target.player === "self"
  );
};

export const isSupportedOpponentEffectFieldRemovalInsteadEffect = (
  effect: Effect,
): boolean =>
  isSupportedLifeTopToHandEffect(effect) ||
  isSupportedRestOwnCardsInsteadEffect(effect) ||
  isSupportedRestSelfInsteadEffect(effect) ||
  isSupportedTrashFromHandInsteadEffect(effect) ||
  isSupportedReturnDonInsteadEffect(effect) ||
  isSupportedModifyLeaderPowerInsteadEffect(effect) ||
  isSupportedTrashSelfInsteadEffect(effect) ||
  isSupportedKoSelfInsteadEffect(effect) ||
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
  if (isSupportedKoSelfInsteadEffect(instead)) {
    return "K.O. this Character instead";
  }
  if (isSupportedOwnerDeckBottomInsteadEffect(instead)) {
    const selectEffect = instead.effects[0]?.effect;
    const count =
      selectEffect?.type === "selectTargets" ? selectEffect.request.min : 1;
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
