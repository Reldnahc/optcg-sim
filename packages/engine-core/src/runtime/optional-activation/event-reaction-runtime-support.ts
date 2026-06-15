import type {
  CardFilter,
  EffectDefinition,
  EffectQueueEntry,
  Trigger,
} from "@optcg/types";

import { isSupportedQueuedEffectConditionShape } from "../../effect-runtime-conditions.js";
import { isSupportedSequenceBlock } from "../../effect-runtime-sequence/support.js";

export const isSupportedActivatedReactionEffect = (
  effect: EffectDefinition["effects"][number],
  entry: EffectQueueEntry,
): boolean =>
  effect.category === "activate" &&
  isSupportedActivatedReactionTrigger(effect.trigger) &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  effect.effect.type === "sequence" &&
  effect.optional !== true &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  isSupportedQueuedEffectConditionShape(effect.condition) &&
  isSupportedSequenceBlock(entry, effect);

const isSupportedActivatedReactionTrigger = (trigger: Trigger): boolean => {
  if (trigger.type === "anyOf") {
    return trigger.triggers.every(isSupportedActivatedReactionTrigger);
  }
  if (trigger.type === "eventCount") {
    return isSupportedActivatedReactionTrigger(trigger.trigger);
  }
  if (trigger.type === "lifeRemoved") {
    return true;
  }
  if (trigger.type === "onOpponentAttack") {
    return isSupportedEventCardFilter(trigger.attackerFilter);
  }
  if (trigger.type === "opponentActivated") {
    return true;
  }
  if (trigger.type === "cardPlayed") {
    return isSupportedActivatedReactionCardPlayedTrigger(trigger);
  }
  if (trigger.type === "fieldRemoved") {
    return (
      trigger.target !== "self" && isSupportedEventCardFilter(trigger.filter)
    );
  }
  return false;
};

const isSupportedActivatedReactionCardPlayedTrigger = (
  trigger: Extract<Trigger, { type: "cardPlayed" }>,
): boolean =>
  isSupportedEventCardFilter(trigger.filter) &&
  isSupportedEventCardFilter(trigger.sourceFilter) &&
  (trigger.anyOf === undefined ||
    trigger.anyOf.every(
      (branch) =>
        isSupportedEventCardFilter(branch.filter) &&
        isSupportedEventCardFilter(branch.sourceFilter),
    ));

const isSupportedEventCardFilter = (
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return keys.every(
    (key) =>
      key === "anyOf" ||
      key === "attributesAny" ||
      key === "attributesNotAny" ||
      key === "baseCost" ||
      key === "categories" ||
      key === "cost" ||
      key === "effectEntryPoint" ||
      key === "typesAny" ||
      key === "typesIncludeAny",
  );
};
