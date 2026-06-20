import type {
  CardFilter,
  Condition,
  Cost,
  Effect,
  OptionalCost,
  Target,
} from "@optcg/types";

export const collectScenarioSetupFilters = (
  effects: readonly {
    readonly condition?: Condition;
    readonly effect: Effect;
  }[],
): readonly CardFilter[] =>
  uniqueFilters(
    effects.flatMap((block) => [
      ...collectConditionFilters(block.condition),
      ...collectEffectFilters(block.effect),
    ]),
  );

const uniqueFilters = (
  filters: readonly CardFilter[],
): readonly CardFilter[] => {
  const seen = new Set<string>();
  const unique: CardFilter[] = [];
  for (const filter of filters) {
    const key = JSON.stringify(filter);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(filter);
  }
  return unique;
};

const collectConditionFilters = (
  condition: Condition | undefined,
): readonly CardFilter[] => {
  if (condition === undefined) {
    return [];
  }
  if (
    condition.type === "cardMatches" ||
    condition.type === "fieldStatTotal" ||
    condition.type === "onlyMatchingFieldCards" ||
    condition.type === "hasCardInZone"
  ) {
    return [condition.filter];
  }
  if (
    condition.type === "fieldCount" ||
    condition.type === "fieldCountTotal" ||
    condition.type === "trashCount"
  ) {
    return condition.filter === undefined ? [] : [condition.filter];
  }
  if (condition.type === "fieldCountDifference") {
    return [
      ...(condition.minuend.filter === undefined
        ? []
        : [condition.minuend.filter]),
      ...(condition.subtrahend.filter === undefined
        ? []
        : [condition.subtrahend.filter]),
    ];
  }
  if (condition.type === "eventHistory") {
    return [
      ...(condition.filter === undefined ? [] : [condition.filter]),
      ...(condition.sourceFilter === undefined ? [] : [condition.sourceFilter]),
    ];
  }
  if (condition.type === "and" || condition.type === "or") {
    return condition.conditions.flatMap(collectConditionFilters);
  }
  if (condition.type === "not") {
    return collectConditionFilters(condition.condition);
  }
  return [];
};

const collectTargetFilters = (target: Target): readonly CardFilter[] => {
  if (target.type === "all" || target.type === "savedFieldObject") {
    return target.filter === undefined ? [] : [target.filter];
  }
  if (target.type === "choose" || target.type === "chooseFromZones") {
    return target.request.filter === undefined ? [] : [target.request.filter];
  }
  return [];
};

const collectEffectFilters = (effect: Effect): readonly CardFilter[] => {
  if (effect.type === "preventPlay" || effect.type === "enterRested") {
    return [effect.filter];
  }
  if (
    effect.type === "revealFromZone" ||
    effect.type === "selectFromSet" ||
    effect.type === "selectCards" ||
    effect.type === "trashFromHand" ||
    effect.type === "modifyCounter"
  ) {
    return effect.filter === undefined ? [] : [effect.filter];
  }
  if (effect.type === "selectTargets" || effect.type === "selectAllTargets") {
    return effect.request.filter === undefined ? [] : [effect.request.filter];
  }
  if (
    effect.type === "bounce" ||
    effect.type === "trash" ||
    effect.type === "ko" ||
    effect.type === "modifyPower" ||
    effect.type === "setPowerToZero" ||
    effect.type === "setBasePower" ||
    effect.type === "rest" ||
    effect.type === "activate" ||
    effect.type === "giveProtection" ||
    effect.type === "attachDon" ||
    effect.type === "attachSelectedDon" ||
    effect.type === "invalidateEffects" ||
    effect.type === "protectFromKO" ||
    effect.type === "cannotBecomeActive" ||
    effect.type === "cannotAttack" ||
    effect.type === "attackCost" ||
    effect.type === "cannotBlock" ||
    effect.type === "preventBlockerActivation" ||
    effect.type === "changeAttackTarget"
  ) {
    return collectTargetFilters(effect.target);
  }
  if (effect.type === "modifyCost") {
    return [
      ...(effect.filter === undefined ? [] : [effect.filter]),
      ...(effect.target === undefined
        ? []
        : collectTargetFilters(effect.target)),
    ];
  }
  if (
    effect.type === "preventPlayByEffects" ||
    effect.type === "allowAttackActiveCharacters" ||
    effect.type === "setBaseCost"
  ) {
    return collectTargetFilters(effect.target);
  }
  if (effect.type === "cannotAttackTarget") {
    return [
      ...collectTargetFilters(effect.target),
      ...(effect.attackTarget.filter === undefined
        ? []
        : [effect.attackTarget.filter]),
    ];
  }
  if (effect.type === "sequence") {
    return effect.effects.flatMap((segment) =>
      segment.effect.type === "payCost"
        ? collectOptionalCostFilters(segment.effect.cost)
        : collectEffectFilters(segment.effect),
    );
  }
  if (effect.type === "choice") {
    return effect.options.flatMap((option) =>
      collectEffectFilters(option.effect),
    );
  }
  if (effect.type === "conditional") {
    return [
      ...collectConditionFilters(effect.if),
      ...collectEffectFilters(effect.then),
      ...(effect.else === undefined ? [] : collectEffectFilters(effect.else)),
    ];
  }
  if (effect.type === "delayed" || effect.type === "forEachSavedTarget") {
    return collectEffectFilters(effect.effect);
  }
  if (effect.type === "replacement") {
    return collectEffectFilters(effect.instead);
  }
  return [];
};

const collectOptionalCostFilters = (
  cost: OptionalCost,
): readonly CardFilter[] => {
  if (
    cost.type === "trashFromHand" ||
    cost.type === "trashSelf" ||
    cost.type === "revealFromHand" ||
    cost.type === "trashFromField" ||
    cost.type === "koFromField" ||
    cost.type === "restFromField" ||
    cost.type === "moveCards" ||
    cost.type === "moveFieldToLife"
  ) {
    return cost.filter === undefined ? [] : [cost.filter];
  }
  if (cost.type === "modifyPower" || cost.type === "attachDon") {
    return collectTargetFilters(cost.target);
  }
  if (cost.type === "sequence") {
    return cost.costs.flatMap(collectCostFilters);
  }
  return [];
};

const collectCostFilters = (cost: Cost): readonly CardFilter[] => {
  if (
    cost.type === "trashFromHand" ||
    cost.type === "trashSelf" ||
    cost.type === "revealFromHand" ||
    cost.type === "trashFromField" ||
    cost.type === "koFromField" ||
    cost.type === "restFromField" ||
    cost.type === "moveCards" ||
    cost.type === "moveFieldToLife"
  ) {
    return cost.filter === undefined ? [] : [cost.filter];
  }
  if (cost.type === "modifyPower" || cost.type === "attachDon") {
    return collectTargetFilters(cost.target);
  }
  if (cost.type === "sequence") {
    return cost.costs.flatMap(collectCostFilters);
  }
  return [];
};
