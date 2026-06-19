import type {
  CardFilter,
  Duration,
  DynamicNumberValue,
  Effect,
  EffectId,
  Keyword,
  Target,
} from "@optcg/types";

import { isSupportedQueuedEffectConditionShape } from "../../effect-runtime-conditions.js";
import { isSupportedReplacementEffect } from "../../replacement/primitives/support-shapes.js";
import type { ContinuousQueueEffect } from "./types.js";
import { isSupportedDonPhasePlacementEffect } from "./don-phase-placement-modifier.js";

const supportedRestriction = new Set([
  "cannotAttack",
  "cannotBlock",
  "preventBlockerActivation",
  "preventPlayByEffects",
  "cannotBecomeActive",
  "cannotActivateDon",
]);

const supportedFilterKeys = new Set<keyof CardFilter>([
  "anyOf",
  "attachedDon",
  "attributesFromSource",
  "baseCost",
  "categories",
  "colorsAny",
  "cost",
  "currentPower",
  "excludeSelf",
  "names",
  "nameNot",
  "power",
  "state",
  "typesAny",
  "typesIncludeAny",
  "typesNotIncludeAny",
]);

const supportedBasePowerSetFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "names",
  "typesAny",
  "typesIncludeAny",
]);

const supportedCostModifierFilterKeys = new Set<keyof CardFilter>([
  "baseCost",
  "categories",
  "colorsAny",
  "cost",
  "names",
  "typesAny",
  "typesIncludeAny",
]);

const supportedPlayRestrictionFilterKeys = new Set<keyof CardFilter>([
  "baseCost",
  "categories",
  "cost",
  "names",
  "typesAny",
  "typesIncludeAny",
]);

const supportedPlayEntryStateFilterKeys = new Set<keyof CardFilter>([
  "baseCost",
  "categories",
  "cost",
  "names",
  "typesAny",
  "typesIncludeAny",
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

export const isSupportedPlayerTarget = (
  target: Target,
): target is Extract<Target, { type: "player" }> => target.type === "player";

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
  filter:
    | CardFilter["attachedDon"]
    | CardFilter["baseCost"]
    | CardFilter["cost"]
    | CardFilter["currentPower"]
    | CardFilter["power"],
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

const isNonEmptyStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((entry) => typeof entry === "string");

const isSupportedAllFilter = (filter: CardFilter | undefined): boolean => {
  if (filter === undefined) return true;
  return (
    Object.keys(filter).every((key) =>
      supportedFilterKeys.has(key as keyof CardFilter),
    ) &&
    (filter.anyOf === undefined ||
      (filter.anyOf.length > 0 && filter.anyOf.every(isSupportedAllFilter))) &&
    (filter.excludeSelf === undefined || filter.excludeSelf) &&
    (filter.names === undefined || isNonEmptyStringArray(filter.names)) &&
    (filter.nameNot === undefined || isNonEmptyStringArray(filter.nameNot)) &&
    hasSupportedNumericFilter(filter.baseCost) &&
    hasSupportedNumericFilter(filter.attachedDon) &&
    hasSupportedNumericFilter(filter.cost) &&
    hasSupportedNumericFilter(filter.currentPower) &&
    hasSupportedNumericFilter(filter.power) &&
    (filter.colorsAny === undefined ||
      isNonEmptyStringArray(filter.colorsAny)) &&
    (filter.typesAny === undefined || isNonEmptyStringArray(filter.typesAny)) &&
    (filter.typesIncludeAny === undefined ||
      isNonEmptyStringArray(filter.typesIncludeAny)) &&
    (filter.typesNotIncludeAny === undefined ||
      isNonEmptyStringArray(filter.typesNotIncludeAny))
  );
};

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
    isNonEmptyStringArray(filter.typesIncludeAny) ||
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
    isNonEmptyStringArray(filter.categories)) &&
  (filter.colorsAny === undefined || isNonEmptyStringArray(filter.colorsAny)) &&
  (isNonEmptyStringArray(filter.categories) ||
    isNonEmptyStringArray(filter.colorsAny) ||
    isNonEmptyStringArray(filter.typesAny) ||
    isNonEmptyStringArray(filter.typesIncludeAny) ||
    isNonEmptyStringArray(filter.names) ||
    filter.baseCost !== undefined ||
    filter.cost !== undefined) &&
  hasSupportedNumericFilter(filter.baseCost) &&
  hasSupportedNumericFilter(filter.cost);

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
  (filter.typesIncludeAny === undefined ||
    isNonEmptyStringArray(filter.typesIncludeAny)) &&
  hasSupportedNumericFilter(filter.baseCost) &&
  hasSupportedNumericFilter(filter.cost);

const isSupportedPlayEntryStateFilter = (
  filter: CardFilter | undefined,
): boolean =>
  filter !== undefined &&
  Object.keys(filter).every((key) =>
    supportedPlayEntryStateFilterKeys.has(key as keyof CardFilter),
  ) &&
  (filter.categories === undefined || filter.categories.length > 0) &&
  (filter.names === undefined || isNonEmptyStringArray(filter.names)) &&
  (filter.typesAny === undefined || isNonEmptyStringArray(filter.typesAny)) &&
  (filter.typesIncludeAny === undefined ||
    isNonEmptyStringArray(filter.typesIncludeAny)) &&
  hasSupportedNumericFilter(filter.baseCost) &&
  hasSupportedNumericFilter(filter.cost);

const isSupportedModifierValue = (
  value: number | DynamicNumberValue,
): boolean =>
  (typeof value === "number" && Number.isSafeInteger(value)) ||
  (typeof value === "object" &&
    ((value.type === "sumSelectedCardCosts" &&
      Number.isSafeInteger(value.multiplier) &&
      value.multiplier > 0) ||
      (value.type === "paidCostCardCount" &&
        value.cost.length > 0 &&
        Number.isSafeInteger(value.multiplier) &&
        value.multiplier > 0) ||
      (value.type === "selectedCardCount" &&
        Number.isSafeInteger(value.per ?? 1) &&
        (value.per ?? 1) > 0 &&
        Number.isSafeInteger(value.multiplier) &&
        value.multiplier !== 0) ||
      (value.type === "countDistinctMatchingFieldNames" &&
        value.player === "self" &&
        value.filter.custom === "differentNames" &&
        Number.isSafeInteger(value.multiplier) &&
        value.multiplier > 0) ||
      (value.type === "countMatchingFieldCards" &&
        (value.player === "self" || value.player === "opponent") &&
        Number.isSafeInteger(value.multiplier) &&
        value.multiplier !== 0 &&
        isSupportedAllFilter(value.filter)) ||
      (value.type === "countMatchingZoneCards" &&
        (value.player === "self" || value.player === "opponent") &&
        Number.isSafeInteger(value.per) &&
        value.per > 0 &&
        Number.isSafeInteger(value.multiplier) &&
        value.multiplier !== 0 &&
        (value.filter === undefined ||
          Object.keys(value.filter).every(
            (key) => key === "categories" || key === "state",
          ))) ||
      (value.type === "countAttachedDon" &&
        Number.isSafeInteger(value.per) &&
        value.per > 0 &&
        Number.isSafeInteger(value.multiplier) &&
        value.multiplier !== 0 &&
        (value.target.type === "self" ||
          value.target.type === "affectedCard" ||
          value.target.type === "myLeader" ||
          value.target.type === "opponentLeader" ||
          value.target.type === "savedFieldObject"))));

export const isSupportedCostModifierEffect = (
  effect: Extract<Effect, { type: "modifyCost" }>,
): boolean =>
  effect.player === "self" &&
  isSupportedModifierValue(effect.value) &&
  !(typeof effect.value === "number" && effect.value === 0) &&
  isSupportedDuration(effect.duration) &&
  (effect.usageLimit === undefined ||
    (Number.isSafeInteger(effect.usageLimit.maxUses) &&
      effect.usageLimit.maxUses > 0)) &&
  ((effect.sourceZone === "hand" &&
    typeof effect.value === "number" &&
    effect.value < 0 &&
    ((effect.target?.type === "self" && effect.filter === undefined) ||
      (effect.target === undefined &&
        isSupportedCostModifierFilter(effect.filter)))) ||
    (effect.sourceZone === undefined &&
      effect.target !== undefined &&
      effect.filter === undefined &&
      isSupportedTarget(effect.target)));

export const isSupportedBasePowerValue = (
  value: Extract<Effect, { type: "setBasePower" }>["value"],
): boolean =>
  (typeof value === "number" && Number.isSafeInteger(value) && value > 0) ||
  (typeof value === "object" &&
    (value.target.type === "myLeader" ||
      value.target.type === "opponentLeader" ||
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
  if (target.type === "attacker") return true;
  if (target.type === "choose") return true;
  if (target.type === "chooseFromZones") {
    return isSupportedChooseFromZonesTarget(target);
  }
  if (target.type !== "all") return false;
  return (
    isSupportedAllFilter(target.filter) &&
    (target.player === "self" ||
      target.player === "opponent" ||
      (target.player === "anyPlayer" && target.zone === "characterArea")) &&
    (target.zone === "leaderArea" || target.zone === "characterArea")
  );
};

export const isSupportedContinuousQueueEffect = (
  effect: Effect,
): effect is ContinuousQueueEffect => {
  if (
    effect.type !== "modifyPower" &&
    effect.type !== "allowAttackActiveCharacters" &&
    effect.type !== "giveKeyword" &&
    effect.type !== "giveAttribute" &&
    effect.type !== "setPowerToZero" &&
    effect.type !== "setBasePower" &&
    effect.type !== "modifyCost" &&
    effect.type !== "modifyCounter" &&
    effect.type !== "preventDraw" &&
    effect.type !== "preventLifeToHand" &&
    effect.type !== "preventDonActivation" &&
    effect.type !== "preventPlay" &&
    effect.type !== "enterRested" &&
    effect.type !== "preventPlayByEffects" &&
    effect.type !== "invalidateEffects" &&
    effect.type !== "invalidateEffectEntryPoint" &&
    effect.type !== "giveProtection" &&
    effect.type !== "protectFromKO" &&
    effect.type !== "grantReplacement" &&
    effect.type !== "cannotBecomeActive" &&
    effect.type !== "cannotAttack" &&
    effect.type !== "cannotAttackTarget" &&
    effect.type !== "attackCost" &&
    effect.type !== "cannotBlock" &&
    effect.type !== "preventBlockerActivation" &&
    effect.type !== "redirectDonPhasePlacement"
  ) {
    return false;
  }
  if (!isSupportedDuration(effect.duration)) return false;
  if (effect.type === "grantReplacement") {
    return isSupportedReplacementEffect({
      id: "continuous:replacement-support" as EffectId,
      category: "replacement",
      trigger: {
        type: "replacement",
        replacement: effect.replacement.when,
      },
      optional: true,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: effect.replacement,
    });
  }
  if (
    effect.type === "allowAttackActiveCharacters" &&
    !isSupportedTarget(effect.target)
  ) {
    return false;
  }
  if (effect.type === "setPowerToZero" && !isSupportedTarget(effect.target)) {
    return false;
  }
  if (
    effect.type === "modifyPower" &&
    (!isSupportedModifierValue(effect.value) ||
      (effect.target.type !== "myLeader" && !isSupportedTarget(effect.target)))
  ) {
    return false;
  }
  if (
    (effect.type === "giveKeyword" || effect.type === "giveAttribute") &&
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
        effect.target.type === "choose" ||
        effect.target.type === "chooseFromZones" ||
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
  if (effect.type === "redirectDonPhasePlacement") {
    return isSupportedDonPhasePlacementEffect(effect, {
      supportsDuration: true,
    });
  }
  if (effect.type === "preventDraw") {
    return effect.player === "self";
  }
  if (effect.type === "preventLifeToHand") {
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
  if (effect.type === "enterRested") {
    return (
      (effect.player === "self" || effect.player === "opponent") &&
      isSupportedPlayEntryStateFilter(effect.filter)
    );
  }
  if (
    effect.type === "preventPlayByEffects" &&
    effect.target.type !== "self" &&
    !isSupportedTarget(effect.target)
  ) {
    return false;
  }
  if (
    effect.type === "invalidateEffects" &&
    effect.target.type !== "myLeader" &&
    !isSupportedTarget(effect.target)
  ) {
    return false;
  }
  if (effect.type === "invalidateEffectEntryPoint") {
    return (
      (effect.player === "self" || effect.player === "opponent") &&
      effect.effectEntryPoint.type.length > 0
    );
  }
  if (
    (effect.type === "giveProtection" || effect.type === "protectFromKO") &&
    !isSupportedTarget(effect.target)
  ) {
    return false;
  }
  if (
    effect.type !== "modifyPower" &&
    effect.type !== "allowAttackActiveCharacters" &&
    effect.type !== "giveKeyword" &&
    effect.type !== "giveAttribute" &&
    effect.type !== "setPowerToZero" &&
    effect.type !== "invalidateEffects" &&
    effect.type !== "giveProtection" &&
    effect.type !== "protectFromKO" &&
    !(
      effect.type === "preventBlockerActivation" &&
      effect.target.type === "myLeader"
    ) &&
    !(
      effect.type === "cannotAttackTarget" && effect.target.type === "myLeader"
    ) &&
    !(
      effect.type === "cannotAttackTarget" &&
      isSupportedPlayerTarget(effect.target)
    ) &&
    !isSupportedTarget(effect.target)
  ) {
    return false;
  }
  if (
    effect.type === "attackCost" &&
    (!Number.isSafeInteger(effect.cost.count) || effect.cost.count <= 0)
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
      effect.type === "cannotAttackTarget" ||
      effect.type === "cannotBlock" ||
      effect.type === "preventPlayByEffects" ||
      effect.type === "preventBlockerActivation") &&
    !supportedRestriction.has(
      effect.type === "cannotAttackTarget" ? "cannotAttack" : effect.type,
    )
  ) {
    return false;
  }
  return true;
};

export const isSourceDependentContinuousQueueEffect = (
  effect: ContinuousQueueEffect,
): boolean =>
  effect.duration.type === "whileSourceOnField" ||
  ("target" in effect && effect.target.type === "self");
