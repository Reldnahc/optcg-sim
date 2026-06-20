import type { CardFilter, Condition, EffectBlock } from "@optcg/types";

export const collectLeaderConditionFilters = (
  effects: readonly EffectBlock[],
  player: "self" | "opponent",
): readonly CardFilter[] =>
  uniqueFilters(
    effects.flatMap((block) =>
      collectLeaderConditionFiltersFromCondition(block.condition, player),
    ),
  );

const collectLeaderConditionFiltersFromCondition = (
  condition: Condition | undefined,
  player: "self" | "opponent",
): readonly CardFilter[] => {
  if (condition === undefined) {
    return [];
  }
  if (
    condition.type === "hasCardInZone" &&
    condition.zone === "leaderArea" &&
    condition.player === player
  ) {
    return [condition.filter];
  }
  if (condition.type === "and" || condition.type === "or") {
    return condition.conditions.flatMap((child) =>
      collectLeaderConditionFiltersFromCondition(child, player),
    );
  }
  if (condition.type === "not") {
    return collectLeaderConditionFiltersFromCondition(
      condition.condition,
      player,
    );
  }
  return [];
};

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
