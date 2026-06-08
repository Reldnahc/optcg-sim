import type {
  CardFilter,
  Duration,
  Effect,
  Keyword,
  Target,
} from "@optcg/types";

import { isSupportedQueuedEffectConditionShape } from "../../effect-runtime-conditions.js";
import type { ContinuousQueueEffect } from "./types.js";

const supportedRestriction = new Set([
  "cannotAttack",
  "cannotBlock",
  "preventBlockerActivation",
  "cannotBecomeActive",
  "cannotActivateDon",
]);

const supportedFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "cost",
  "names",
  "power",
  "state",
]);

const supportedBasePowerSetFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "names",
  "typesAny",
]);

const supportedCostModifierFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "cost",
  "typesAny",
]);

const supportedPlayRestrictionFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "cost",
  "names",
  "typesAny",
]);

const supportedDerivedKeywords = new Set<Keyword>([
  "blocker",
  "banish",
  "rush",
  "rushCharacter",
  "doubleAttack",
  "unblockable",
]);

export const isSupportedDerivedKeyword = (keyword: Keyword): boolean =>
  supportedDerivedKeywords.has(keyword);

export const isSupportedDuration = (duration: Duration): boolean => {
  if (
    duration.type === "thisBattle" ||
    duration.type === "thisTurn" ||
    duration.type === "whileSourceOnField" ||
    duration.type === "permanent"
  ) {
    return true;
  }
  if (duration.type === "untilEndOfTurn") {
    const whoseTurn = duration.whoseTurn ?? "current";
    return whoseTurn === "current" || whoseTurn === "sourceController";
  }
  if (duration.type === "untilEndOfNextTurn") {
    return (
      duration.player === "self" ||
      duration.player === "opponent" ||
      duration.player === "controller" ||
      duration.player === "owner"
    );
  }
  if (duration.type !== "untilStartOfNextTurn") {
    return (
      duration.type === "whileConditionTrue" &&
      isSupportedQueuedEffectConditionShape(duration.condition)
    );
  }
  return (
    duration.player === "self" ||
    duration.player === "opponent" ||
    duration.player === "controller" ||
    duration.player === "owner"
  );
};

export const isSupportedBasePowerDuration = (duration: Duration): boolean =>
  duration.type === "permanent" ||
  duration.type === "whileSourceOnField" ||
  (duration.type === "whileConditionTrue" &&
    isSupportedQueuedEffectConditionShape(duration.condition));

const hasSupportedNumericFilter = (
  filter: CardFilter["cost"] | CardFilter["power"],
): boolean => {
  if (filter === undefined) return true;
  if ("op" in filter) {
    return filter.op === "eq" && Number.isFinite(filter.value);
  }
  return (
    (filter.min === undefined || Number.isFinite(filter.min)) &&
    (filter.max === undefined || Number.isFinite(filter.max)) &&
    (filter.min === undefined ||
      filter.max === undefined ||
      filter.min <= filter.max)
  );
};

const isSupportedAllFilter = (filter: CardFilter | undefined): boolean =>
  filter === undefined ||
  (Object.keys(filter).every((key) =>
    supportedFilterKeys.has(key as keyof CardFilter),
  ) &&
    hasSupportedNumericFilter(filter.cost) &&
    hasSupportedNumericFilter(filter.power));

const isNonEmptyStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((entry) => typeof entry === "string");

export const isSupportedBasePowerSetFilter = (
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) return false;
  if (
    !Object.keys(filter).every((key) =>
      supportedBasePowerSetFilterKeys.has(key as keyof CardFilter),
    )
  ) {
    return false;
  }
  if (filter.categories !== undefined) {
    if (
      filter.categories.length === 0 ||
      !filter.categories.every((category) => category === "character")
    ) {
      return false;
    }
  }
  return (
    isNonEmptyStringArray(filter.typesAny) ||
    isNonEmptyStringArray(filter.names)
  );
};

const isSupportedCostModifierFilter = (
  filter: CardFilter | undefined,
): boolean =>
  filter !== undefined &&
  Object.keys(filter).every((key) =>
    supportedCostModifierFilterKeys.has(key as keyof CardFilter),
  ) &&
  (filter.categories === undefined ||
    filter.categories.every((category) => category === "character")) &&
  isNonEmptyStringArray(filter.typesAny) &&
  hasSupportedNumericFilter(filter.cost);

export const isSupportedCostModifierEffect = (
  effect: Extract<Effect, { type: "modifyCost" }>,
): boolean =>
  effect.player === "self" &&
  Number.isSafeInteger(effect.value) &&
  effect.value !== 0 &&
  isSupportedDuration(effect.duration) &&
  ((effect.sourceZone === "hand" &&
    effect.value < 0 &&
    ((effect.target?.type === "self" && effect.filter === undefined) ||
      (effect.target === undefined &&
        isSupportedCostModifierFilter(effect.filter)))) ||
    (effect.sourceZone === undefined &&
      effect.target !== undefined &&
      effect.filter === undefined &&
      isSupportedTarget(effect.target)));

const isSupportedPlayRestrictionFilter = (
  filter: CardFilter | undefined,
): boolean =>
  filter !== undefined &&
  Object.keys(filter).every((key) =>
    supportedPlayRestrictionFilterKeys.has(key as keyof CardFilter),
  ) &&
  (filter.categories === undefined || filter.categories.length > 0) &&
  (filter.names === undefined || isNonEmptyStringArray(filter.names)) &&
  (filter.typesAny === undefined || isNonEmptyStringArray(filter.typesAny)) &&
  hasSupportedNumericFilter(filter.cost);

const isSupportedPowerValue = (
  value: Extract<Effect, { type: "modifyPower" }>["value"],
): boolean =>
  (typeof value === "number" && Number.isSafeInteger(value)) ||
  (typeof value === "object" &&
    ((value.type === "sumSelectedCardCosts" &&
      Number.isSafeInteger(value.multiplier) &&
      value.multiplier > 0) ||
      (value.type === "countDistinctMatchingFieldNames" &&
        value.player === "self" &&
        value.filter.custom === "differentNames" &&
        Number.isSafeInteger(value.multiplier) &&
        value.multiplier > 0)));

const isSupportedBasePowerValue = (
  value: Extract<Effect, { type: "setBasePower" }>["value"],
): boolean =>
  (typeof value === "number" && Number.isSafeInteger(value) && value > 0) ||
  (typeof value === "object" &&
    (value.target.type === "opponentLeader" ||
      (value.target.type === "savedFieldObject" &&
        value.target.binding.family === "selectedTargets" &&
        value.target.zone === "characterArea" &&
        (value.target.player === "self" ||
          value.target.player === "opponent"))));

const isSupportedChooseFromZonesTarget = (
  target: Extract<Target, { type: "chooseFromZones" }>,
): boolean =>
  target.request.timing === "onResolution" &&
  target.request.chooser === "self" &&
  (target.request.player === "self" || target.request.player === "opponent") &&
  target.request.zones.length > 0 &&
  target.request.zones.every(
    (zone) =>
      zone === "leaderArea" ||
      zone === "characterArea" ||
      zone === "stageArea" ||
      zone === "costArea",
  ) &&
  target.request.min >= 0 &&
  target.request.max >= target.request.min &&
  target.request.visibility === "public" &&
  isSupportedAllFilter(target.request.filter);

export const isSupportedTarget = (target: Target): boolean => {
  if (target.type === "self") return true;
  if (target.type === "choose") return true;
  if (target.type === "chooseFromZones") {
    return isSupportedChooseFromZonesTarget(target);
  }
  if (target.type !== "all") return false;
  return (
    isSupportedAllFilter(target.filter) &&
    (target.player === "self" || target.player === "opponent") &&
    (target.zone === "leaderArea" || target.zone === "characterArea")
  );
};

export const isSupportedContinuousQueueEffect = (
  effect: Effect,
): effect is ContinuousQueueEffect => {
  if (
    effect.type !== "modifyPower" &&
    effect.type !== "giveKeyword" &&
    effect.type !== "setBasePower" &&
    effect.type !== "modifyCost" &&
    effect.type !== "modifyCounter" &&
    effect.type !== "preventDraw" &&
    effect.type !== "preventDonActivation" &&
    effect.type !== "preventPlay" &&
    effect.type !== "invalidateEffects" &&
    effect.type !== "giveProtection" &&
    effect.type !== "protectFromKO" &&
    effect.type !== "cannotBecomeActive" &&
    effect.type !== "cannotAttack" &&
    effect.type !== "cannotBlock" &&
    effect.type !== "preventBlockerActivation"
  ) {
    return false;
  }
  if (!isSupportedDuration(effect.duration)) return false;
  if (
    effect.type === "modifyPower" &&
    (!isSupportedPowerValue(effect.value) ||
      (effect.target.type !== "myLeader" && !isSupportedTarget(effect.target)))
  ) {
    return false;
  }
  if (
    effect.type === "giveKeyword" &&
    effect.target.type !== "myLeader" &&
    !isSupportedTarget(effect.target)
  ) {
    return false;
  }
  if (effect.type === "setBasePower") {
    return (
      isSupportedBasePowerValue(effect.value) &&
      isSupportedDuration(effect.duration) &&
      (effect.target.type === "self" ||
        effect.target.type === "myLeader" ||
        (effect.target.type === "all" &&
          effect.target.zone === "characterArea" &&
          (effect.target.player === "self" ||
            effect.target.player === "opponent") &&
          isSupportedBasePowerSetFilter(effect.target.filter)))
    );
  }
  if (effect.type === "modifyCost") {
    return isSupportedCostModifierEffect(effect);
  }
  if (effect.type === "modifyCounter") {
    return (
      effect.player === "self" &&
      effect.sourceZone === "hand" &&
      Number.isSafeInteger(effect.value) &&
      effect.value >= 0
    );
  }
  if (effect.type === "preventDraw") {
    return effect.player === "self";
  }
  if (effect.type === "preventDonActivation") {
    return effect.player === "self" && effect.sourceCategories.length > 0;
  }
  if (effect.type === "preventPlay") {
    return (
      effect.player === "self" &&
      isSupportedPlayRestrictionFilter(effect.filter)
    );
  }
  if (
    effect.type === "invalidateEffects" &&
    effect.target.type !== "myLeader" &&
    !isSupportedTarget(effect.target)
  ) {
    return false;
  }
  if (
    (effect.type === "giveProtection" || effect.type === "protectFromKO") &&
    !isSupportedTarget(effect.target)
  ) {
    return false;
  }
  if (
    effect.type !== "modifyPower" &&
    effect.type !== "giveKeyword" &&
    effect.type !== "invalidateEffects" &&
    effect.type !== "giveProtection" &&
    effect.type !== "protectFromKO" &&
    !isSupportedTarget(effect.target)
  ) {
    return false;
  }
  if (
    effect.type === "giveKeyword" &&
    !isSupportedDerivedKeyword(effect.keyword)
  ) {
    return false;
  }
  if (
    (effect.type === "cannotAttack" ||
      effect.type === "cannotBlock" ||
      effect.type === "preventBlockerActivation") &&
    !supportedRestriction.has(effect.type)
  ) {
    return false;
  }
  return true;
};
