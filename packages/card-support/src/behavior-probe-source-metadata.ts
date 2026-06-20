import type {
  CardFilter,
  CardInstance,
  Condition,
  EffectBlock,
  GameState,
  ResolvedCard,
} from "@optcg/types";

import {
  profileForCardFilter,
  type ProbeCardProfile,
} from "./behavior-probe-scenario-profiles.js";
import { resolvedProbeCard } from "./behavior-probe-resolved-card.js";

export const installProbeSourceConditionMetadata = (
  state: GameState,
  source: CardInstance,
  effects: readonly EffectBlock[],
): void => {
  const conditionFilters = effects.flatMap((block) =>
    collectSourceConditionFilters(block.condition),
  );
  if (conditionFilters.length === 0) {
    return;
  }
  const resolved = state.cardManifest.cards[source.cardId];
  if (resolved === undefined) {
    return;
  }
  const conditionProfile = profileForSourceFilters(conditionFilters);
  const category =
    resolved.category === "leader" ||
    resolved.category === "event" ||
    resolved.category === "stage"
      ? resolved.category
      : "character";
  const mergedProfile = mergeProbeCardProfile(
    profileFromResolvedCard(resolved),
    conditionProfile,
  );
  state.cardManifest.cards[source.cardId] = resolvedProbeCard({
    cardId: source.cardId,
    category,
    effectText: resolved.effectText ?? "",
    profile:
      category === "character" ? mergedProfile : { ...mergedProfile, category },
    support: resolved.support,
  });
};

export const profileForSourceFilters = (
  filters: readonly CardFilter[],
): ProbeCardProfile => {
  const profiles = filters.map((filter, index) =>
    profileForCardFilter(filter, index),
  );
  const costs = profiles.flatMap((profile) =>
    profile.cost === undefined ? [] : [profile.cost],
  );
  const powers = profiles.flatMap((profile) =>
    profile.power === undefined ? [] : [profile.power],
  );
  const counters = profiles.flatMap((profile) =>
    profile.counter === undefined ? [] : [profile.counter],
  );
  const name = profiles.find((profile) => profile.name !== undefined)?.name;
  return {
    category: "character",
    ...(name === undefined ? {} : { name }),
    colors: uniqueProfileValues(profiles.flatMap((profile) => profile.colors)),
    attributes: uniqueProfileValues(
      profiles.flatMap((profile) => profile.attributes),
    ),
    types: uniqueProfileValues(profiles.flatMap((profile) => profile.types)),
    keywords: uniqueProfileValues(
      profiles.flatMap((profile) => profile.keywords),
    ),
    ...(costs.length === 0 ? {} : { cost: Math.max(...costs) }),
    ...(powers.length === 0 ? {} : { power: Math.max(...powers) }),
    ...(counters.length === 0 ? {} : { counter: Math.max(...counters) }),
  };
};

const collectSourceConditionFilters = (
  condition: Condition | undefined,
): readonly CardFilter[] => {
  if (condition === undefined) {
    return [];
  }
  if (condition.type === "cardStatComparison") {
    return sourceStatConditionFilter(condition);
  }
  if (
    condition.type === "fieldCount" &&
    condition.op === "eq" &&
    condition.value === 0 &&
    condition.filter?.excludeSelf === true
  ) {
    return [condition.filter];
  }
  if (condition.type === "and" || condition.type === "or") {
    return condition.conditions.flatMap(collectSourceConditionFilters);
  }
  if (condition.type === "not") {
    return collectSourceConditionFilters(condition.condition);
  }
  return [];
};

const sourceStatConditionFilter = (
  condition: Extract<Condition, { type: "cardStatComparison" }>,
): readonly CardFilter[] => {
  if (condition.target.type !== "self" || typeof condition.value !== "number") {
    return [];
  }
  const predicate = { op: condition.op, value: condition.value };
  if (condition.stat === "cost" || condition.stat === "baseCost") {
    return [{ categories: ["character"], cost: predicate }];
  }
  if (condition.stat === "power" || condition.stat === "currentPower") {
    return [{ categories: ["character"], currentPower: predicate }];
  }
  return [];
};

const profileFromResolvedCard = (card: ResolvedCard): ProbeCardProfile => ({
  category: card.category,
  name: card.name,
  colors: card.colors,
  attributes: card.attributes,
  types: card.types,
  keywords: card.printedKeywords,
  ...(card.cost === undefined ? {} : { cost: card.cost }),
  ...(card.power === undefined ? {} : { power: card.power }),
  ...(card.counter === undefined ? {} : { counter: card.counter }),
});

const mergeProbeCardProfile = (
  base: ProbeCardProfile,
  override: ProbeCardProfile,
): ProbeCardProfile => {
  const category = override.category ?? base.category;
  const name = override.name ?? base.name;
  const colors = uniqueProfileValues([
    ...(base.colors ?? []),
    ...(override.colors ?? []),
  ]);
  const attributes = uniqueProfileValues([
    ...(base.attributes ?? []),
    ...(override.attributes ?? []),
  ]);
  const types = uniqueProfileValues([
    ...(base.types ?? []),
    ...(override.types ?? []),
  ]);
  const keywords = uniqueProfileValues([
    ...(base.keywords ?? []),
    ...(override.keywords ?? []),
  ]);
  return {
    ...(category === undefined ? {} : { category }),
    ...(name === undefined ? {} : { name }),
    ...(colors.length === 0 ? {} : { colors }),
    ...(attributes.length === 0 ? {} : { attributes }),
    ...(types.length === 0 ? {} : { types }),
    ...(keywords.length === 0 ? {} : { keywords }),
    ...mergedNumberProfileValue("cost", base.cost, override.cost),
    ...mergedNumberProfileValue("power", base.power, override.power),
    ...mergedNumberProfileValue("counter", base.counter, override.counter),
  };
};

const mergedNumberProfileValue = (
  key: "cost" | "power" | "counter",
  base: number | undefined,
  override: number | undefined,
): Partial<ProbeCardProfile> =>
  base === undefined && override === undefined
    ? {}
    : { [key]: Math.max(base ?? 0, override ?? 0) };

const uniqueProfileValues = <T>(
  values: readonly (T | undefined)[],
): readonly T[] => [
  ...new Set(values.filter((value): value is T => value !== undefined)),
];
