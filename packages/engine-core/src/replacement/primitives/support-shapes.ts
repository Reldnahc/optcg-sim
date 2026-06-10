import type { Effect, EffectDefinition, Target } from "@optcg/types";

import { isSupportedLifeTopToHandEffect } from "../../effect-runtime-move-cards.js";
import {
  isSupportedKoSelfInsteadEffect,
  isSupportedModifyLeaderPowerInsteadEffect,
  isSupportedOwnerDeckBottomInsteadEffect,
  isSupportedRestOwnCardsInsteadEffect,
  isSupportedRestSelfInsteadEffect,
  isSupportedReturnDonInsteadEffect,
  isSupportedTrashFromHandInsteadEffect,
  isSupportedTrashSelfInsteadEffect,
} from "../instead-effects.js";
import type { SupportedReplacementEffectBlock } from "./types.js";

const isSelfTarget = (
  target: Target,
): target is Extract<Target, { type: "self" }> => target.type === "self";

export const isSupportedSelfKoDrawReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  isSelfTarget(effect.trigger.replacement.target) &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn === undefined &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldBeKOd" &&
  isSelfTarget(effect.effect.when.target) &&
  effect.effect.instead.type === "draw" &&
  effect.effect.instead.count === 1 &&
  effect.effect.instead.player === "self";

export const isSupportedOpponentFieldRemovalLifeReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldMoveZone" &&
  effect.trigger.replacement.from === "characterArea" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn === undefined &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldMoveZone" &&
  effect.effect.when.from === "characterArea" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  isSupportedLifeTopToHandEffect(effect.effect.instead);

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

export const isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldMoveZone" &&
  effect.trigger.replacement.from === "characterArea" &&
  effect.trigger.replacement.sourceKind === "cardEffect" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn === undefined &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldMoveZone" &&
  effect.effect.when.from === "characterArea" &&
  effect.effect.when.sourceKind === "cardEffect" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  isSupportedRestOwnCardsInsteadEffect(effect.effect.instead);

export const isSupportedOpponentEffectFieldRemovalReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldMoveZone" &&
  effect.trigger.replacement.from === "characterArea" &&
  effect.trigger.replacement.sourceKind === "cardEffect" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn === undefined &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldMoveZone" &&
  effect.effect.when.from === "characterArea" &&
  effect.effect.when.sourceKind === "cardEffect" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  isSupportedOpponentEffectFieldRemovalInsteadEffect(effect.effect.instead);

export const isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldMoveZone" &&
  effect.trigger.replacement.from === "characterArea" &&
  effect.trigger.replacement.sourceKind === "cardEffect" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn === undefined &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldMoveZone" &&
  effect.effect.when.from === "characterArea" &&
  effect.effect.when.sourceKind === "cardEffect" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  isSupportedRestSelfInsteadEffect(effect.effect.instead);

export const isSupportedOpponentEffectKoRestSelfReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  effect.trigger.replacement.sourceKind === "cardEffect" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn === undefined &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldBeKOd" &&
  effect.effect.when.sourceKind === "cardEffect" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  isSupportedRestSelfInsteadEffect(effect.effect.instead);

export const isSupportedOpponentKoTrashFromHandReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn !== false &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldBeKOd" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  effect.effect.when.sourceKind === effect.trigger.replacement.sourceKind &&
  effect.effect.when.sourceControllerRelation ===
    effect.trigger.replacement.sourceControllerRelation &&
  isSupportedTrashFromHandInsteadEffect(effect.effect.instead);

export const isSupportedSelfKoTrashFromHandReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  isSelfTarget(effect.trigger.replacement.target) &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn === undefined &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldBeKOd" &&
  isSelfTarget(effect.effect.when.target) &&
  isSupportedTrashFromHandInsteadEffect(effect.effect.instead);

export const isSupportedReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedSelfKoDrawReplacementEffect(effect) ||
  isSupportedOpponentFieldRemovalLifeReplacementEffect(effect) ||
  isSupportedOpponentEffectFieldRemovalReplacementEffect(effect) ||
  isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect(effect) ||
  isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect(effect) ||
  isSupportedOpponentEffectKoRestSelfReplacementEffect(effect) ||
  isSupportedOpponentKoTrashFromHandReplacementEffect(effect) ||
  isSupportedSelfKoTrashFromHandReplacementEffect(effect);

export const isReplacementTriggerEffect = (
  effect: EffectDefinition["effects"][number],
): boolean =>
  effect.category === "replacement" ||
  effect.trigger.type === "replacement" ||
  effect.effect.type === "replacement";

export const isSupportedReplacementEffectBlock = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedReplacementEffect(effect);
