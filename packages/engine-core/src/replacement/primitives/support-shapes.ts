import type {
  CardFilter,
  Effect,
  EffectDefinition,
  ReplacementTrigger,
  Target,
} from "@optcg/types";

import { isSupportedQueuedEffectConditionShape } from "../../effect-runtime-conditions.js";
import { isSupportedLifeTopToHandEffect } from "../../effect-runtime-move-cards.js";
import {
  isSupportedKoSelfInsteadEffect,
  isSupportedModifyPowerInsteadEffect,
  isSupportedOwnerDeckBottomInsteadEffect,
  isSupportedReplacementInsteadSequenceEffect,
  isSupportedRestOwnCardsInsteadEffect,
  isSupportedRestSelfInsteadEffect,
  isSupportedReturnDonInsteadEffect,
  isSupportedTrashFromHandInsteadEffect,
  isSupportedTrashSelfInsteadEffect,
  isSupportedDrawInsteadEffect,
} from "../instead-effects.js";
import type { SupportedReplacementEffectBlock } from "./types.js";

const replacementKind = "replacement";

const isSelfTarget = (
  target: Target,
): target is Extract<Target, { type: "self" }> => target.type === "self";

const isNonEmptyStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((entry) => typeof entry === "string");

const hasSupportedNumericFilter = (
  filter: CardFilter["cost"] | CardFilter["power"] | CardFilter["baseCost"],
): boolean => {
  if (filter === undefined) return true;
  if ("op" in filter) {
    return Number.isFinite(filter.value);
  }
  return (
    (filter.min === undefined || Number.isFinite(filter.min)) &&
    (filter.max === undefined || Number.isFinite(filter.max)) &&
    (filter.min === undefined ||
      filter.max === undefined ||
      filter.min <= filter.max)
  );
};

const isSupportedCharacterReplacementTargetFilter = (
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) return true;
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.every(
      (key) =>
        key === "categories" ||
        key === "names" ||
        key === "typesAny" ||
        key === "typesIncludeAny" ||
        key === "cost" ||
        key === "baseCost" ||
        key === "power" ||
        key === "state",
    ) &&
    (filter.categories === undefined ||
      filter.categories.every((category) => category === "character")) &&
    (filter.names === undefined || isNonEmptyStringArray(filter.names)) &&
    (filter.typesAny === undefined || isNonEmptyStringArray(filter.typesAny)) &&
    (filter.typesIncludeAny === undefined ||
      isNonEmptyStringArray(filter.typesIncludeAny)) &&
    hasSupportedNumericFilter(filter.cost) &&
    hasSupportedNumericFilter(filter.baseCost) &&
    hasSupportedNumericFilter(filter.power) &&
    (filter.state === undefined ||
      filter.state === "active" ||
      filter.state === "rested")
  );
};

const isSupportedSelfCharacterReplacementTarget = (target: Target): boolean =>
  target.type === "all" &&
  target.zone === "characterArea" &&
  target.player === "self" &&
  isSupportedCharacterReplacementTargetFilter(target.filter);

const isSupportedSelfOrAllCharacterReplacementTarget = (
  target: Target,
): boolean =>
  isSelfTarget(target) ||
  (target.type === "all" &&
    target.zone === "characterArea" &&
    target.player === "self");

const isSupportedReplacementEnvelope = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.conditionTiming === undefined &&
  isSupportedQueuedEffectConditionShape(effect.condition) &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.effect.type === "replacement";

export const isSupportedSelfKoDrawReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedReplacementEnvelope(effect) &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  isSelfTarget(effect.trigger.replacement.target) &&
  effect.oncePerTurn === undefined &&
  effect.effect.when.type === "wouldBeKOd" &&
  isSelfTarget(effect.effect.when.target) &&
  effect.effect.instead.type === "draw" &&
  effect.effect.instead.count === 1 &&
  effect.effect.instead.player === "self";

export const isSupportedOpponentFieldRemovalLifeReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedReplacementEnvelope(effect) &&
  effect.trigger.replacement.type === "wouldMoveZone" &&
  effect.trigger.replacement.from === "characterArea" &&
  isSupportedSelfCharacterReplacementTarget(
    effect.trigger.replacement.target,
  ) &&
  effect.oncePerTurn === undefined &&
  effect.effect.when.type === "wouldMoveZone" &&
  effect.effect.when.from === "characterArea" &&
  isSupportedSelfCharacterReplacementTarget(effect.effect.when.target) &&
  isSupportedLifeTopToHandEffect(effect.effect.instead);

export const isSupportedKoLifeTopToHandReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedReplacementEnvelope(effect) &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  isSupportedSelfCharacterReplacementTarget(
    effect.trigger.replacement.target,
  ) &&
  effect.oncePerTurn !== false &&
  effect.effect.when.type === "wouldBeKOd" &&
  isSupportedSelfCharacterReplacementTarget(effect.effect.when.target) &&
  effect.effect.when.sourceKind === effect.trigger.replacement.sourceKind &&
  effect.effect.when.sourceControllerRelation ===
    effect.trigger.replacement.sourceControllerRelation &&
  isSupportedLifeTopToHandEffect(effect.effect.instead);

const replacementKoSourcesMatch = (
  trigger: Extract<ReplacementTrigger, { type: "wouldBeKOd" }>,
  when: Extract<ReplacementTrigger, { type: "wouldBeKOd" }>,
): boolean =>
  when.sourceKind === trigger.sourceKind &&
  when.sourceControllerRelation === trigger.sourceControllerRelation;

export const isSupportedKoInsteadReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedReplacementEnvelope(effect) &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  isSupportedSelfOrAllCharacterReplacementTarget(
    effect.trigger.replacement.target,
  ) &&
  effect.oncePerTurn !== false &&
  effect.effect.when.type === "wouldBeKOd" &&
  isSupportedSelfOrAllCharacterReplacementTarget(effect.effect.when.target) &&
  replacementKoSourcesMatch(effect.trigger.replacement, effect.effect.when) &&
  isSupportedOpponentEffectFieldRemovalInsteadEffect(effect.effect.instead);

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
  isSupportedReplacementInsteadSequenceEffect(effect) ||
  isSupportedOwnerDeckBottomInsteadEffect(effect);

export const isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedReplacementEnvelope(effect) &&
  effect.trigger.replacement.type === "wouldMoveZone" &&
  effect.trigger.replacement.from === "characterArea" &&
  effect.trigger.replacement.sourceKind === "cardEffect" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.oncePerTurn === undefined &&
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
  isSupportedReplacementEnvelope(effect) &&
  effect.trigger.replacement.type === "wouldMoveZone" &&
  effect.trigger.replacement.from === "characterArea" &&
  effect.trigger.replacement.sourceKind === "cardEffect" &&
  isSupportedSelfOrAllCharacterReplacementTarget(
    effect.trigger.replacement.target,
  ) &&
  effect.oncePerTurn !== false &&
  effect.effect.when.type === "wouldMoveZone" &&
  effect.effect.when.from === "characterArea" &&
  effect.effect.when.sourceKind === "cardEffect" &&
  isSupportedSelfOrAllCharacterReplacementTarget(effect.effect.when.target) &&
  isSupportedOpponentEffectFieldRemovalInsteadEffect(effect.effect.instead);

export const isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedReplacementEnvelope(effect) &&
  effect.trigger.replacement.type === "wouldMoveZone" &&
  effect.trigger.replacement.from === "characterArea" &&
  effect.trigger.replacement.sourceKind === "cardEffect" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.oncePerTurn === undefined &&
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
  isSupportedReplacementEnvelope(effect) &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  effect.trigger.replacement.sourceKind === "cardEffect" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.oncePerTurn === undefined &&
  effect.effect.when.type === "wouldBeKOd" &&
  effect.effect.when.sourceKind === "cardEffect" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  isSupportedRestSelfInsteadEffect(effect.effect.instead);

export const isSupportedOpponentKoTrashFromHandReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedReplacementEnvelope(effect) &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.oncePerTurn !== false &&
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
  isSupportedReplacementEnvelope(effect) &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  isSelfTarget(effect.trigger.replacement.target) &&
  effect.oncePerTurn === undefined &&
  effect.effect.when.type === "wouldBeKOd" &&
  isSelfTarget(effect.effect.when.target) &&
  isSupportedTrashFromHandInsteadEffect(effect.effect.instead);

export const isSupportedReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedSelfKoDrawReplacementEffect(effect) ||
  isSupportedOpponentFieldRemovalLifeReplacementEffect(effect) ||
  isSupportedKoLifeTopToHandReplacementEffect(effect) ||
  isSupportedKoInsteadReplacementEffect(effect) ||
  isSupportedOpponentEffectFieldRemovalReplacementEffect(effect) ||
  isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect(effect) ||
  isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect(effect) ||
  isSupportedOpponentEffectKoRestSelfReplacementEffect(effect) ||
  isSupportedOpponentKoTrashFromHandReplacementEffect(effect) ||
  isSupportedSelfKoTrashFromHandReplacementEffect(effect);

export const isReplacementTriggerEffect = (
  effect: EffectDefinition["effects"][number],
): boolean =>
  effect.category === replacementKind ||
  effect.trigger.type === replacementKind ||
  effect.effect.type === replacementKind;

export const isSupportedReplacementEffectBlock = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedReplacementEffect(effect);
