import type { Condition, Effect } from "@optcg/types";

export const hasCondition = (
  condition: Condition | undefined,
  type: Condition["type"],
): boolean => {
  if (condition === undefined) {
    return false;
  }
  if (condition.type === type) {
    return true;
  }
  if (condition.type === "and" || condition.type === "or") {
    return condition.conditions.some((child) => hasCondition(child, type));
  }
  if (condition.type === "not") {
    return hasCondition(condition.condition, type);
  }
  return false;
};

export const effectUsesAttachedDonCount = (effect: Effect): boolean => {
  if (JSON.stringify(effect).includes('"attachedDonCount"')) {
    return true;
  }
  if (JSON.stringify(effect).includes('"countAttachedDon"')) {
    return true;
  }
  return false;
};

export const effectSelectsRestedDon = (effect: Effect): boolean => {
  if (
    effect.type === "selectCards" &&
    effect.zone === "costArea" &&
    effect.filter?.categories?.includes("don") === true &&
    effect.filter.state === "rested"
  ) {
    return true;
  }
  if (effect.type === "sequence") {
    return effect.effects.some((segment) =>
      effectSelectsRestedDon(segment.effect),
    );
  }
  if (effect.type === "conditional") {
    return (
      effectSelectsRestedDon(effect.then) ||
      (effect.else === undefined ? false : effectSelectsRestedDon(effect.else))
    );
  }
  if (effect.type === "choice") {
    return effect.options.some((option) =>
      effectSelectsRestedDon(option.effect),
    );
  }
  if (effect.type === "delayed" || effect.type === "forEachSavedTarget") {
    return effectSelectsRestedDon(effect.effect);
  }
  if (effect.type === "replacement") {
    return effectSelectsRestedDon(effect.instead);
  }
  return false;
};
