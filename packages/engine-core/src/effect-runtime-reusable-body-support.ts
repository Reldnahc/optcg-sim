import type { Effect } from "@optcg/types";

import { autoRuntimeEntryAdapterForTriggerType } from "./effect-runtime-entry-adapters.js";
import { isSupportedMoveCardsEffect } from "./effect-runtime-move-cards.js";
import { isSupportedPlaceTopDeckCardsEffect } from "./effect-runtime-top-deck-placement.js";
import {
  isSupportedDrawBody,
  isSupportedWinGameBody,
} from "./runtime/primitives/execute.js";
import { isSupportedTrashFromHandUntilCountBody } from "./runtime/primitives/trash-from-hand-until.js";

export const isSupportedDrawUpToBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "drawUpTo" }> =>
  effect.type === "drawUpTo" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

const isSupportedActivateReferencedEffectBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "activateReferencedEffect" }> =>
  effect.type === "activateReferencedEffect" &&
  effect.source.type === "triggerCard" &&
  effect.trigger.type !== "anyOf" &&
  autoRuntimeEntryAdapterForTriggerType(effect.trigger.type) !== undefined;

const isSupportedPlaySourceBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "playSource" }> =>
  effect.type === "playSource" &&
  effect.source.type === "triggerCard" &&
  effect.ignoreCost === true;

export const isSupportedTrashFromHandBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "trashFromHand" }> =>
  effect.type === "trashFromHand" &&
  (effect.player === "self" || effect.player === "opponent") &&
  effect.chooser === effect.player &&
  effect.filter === undefined &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

const isSupportedDamageBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "damage" }> =>
  effect.type === "damage" &&
  (effect.player === "self" || effect.player === "opponent") &&
  effect.count === 1;

export const isSupportedReusableEffectBody = (effect: Effect): boolean =>
  isSupportedDrawBody(effect) ||
  isSupportedDrawUpToBody(effect) ||
  isSupportedTrashFromHandBody(effect) ||
  isSupportedTrashFromHandUntilCountBody(effect) ||
  isSupportedMoveCardsEffect(effect) ||
  isSupportedDamageBody(effect) ||
  isSupportedPlaceTopDeckCardsEffect(effect) ||
  isSupportedWinGameBody(effect) ||
  isSupportedActivateReferencedEffectBody(effect) ||
  isSupportedPlaySourceBody(effect);
