import type {
  CardFilter,
  CardInstance,
  GameState,
  PlayerId,
} from "@optcg/types";

import { cardMatchesAnyName } from "../card-name-matching.js";
import {
  allContinuousEffects,
  durationIsActive,
} from "../view/compute-view-continuous.js";

const numericFilterMatches = (
  value: number | undefined,
  filter: CardFilter["power"] | undefined,
): boolean => {
  if (filter === undefined) return true;
  if (value === undefined) return false;
  if ("op" in filter) {
    switch (filter.op) {
      case "eq":
        return value === filter.value;
      case "neq":
        return value !== filter.value;
      case "gt":
        return value > filter.value;
      case "gte":
        return value >= filter.value;
      case "lt":
        return value < filter.value;
      case "lte":
        return value <= filter.value;
    }
  }
  if (filter.min !== undefined && value < filter.min) return false;
  if (filter.max !== undefined && value > filter.max) return false;
  return true;
};

const handCardMatchesCounterFilter = (
  state: GameState,
  card: CardInstance,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) return true;
  const metadata = state.cardManifest.cards[card.cardId];
  if (metadata === undefined) return false;
  if (
    filter.categories !== undefined &&
    !filter.categories.includes(metadata.category)
  ) {
    return false;
  }
  if (
    filter.typesAny !== undefined &&
    !filter.typesAny.some((type) => metadata.types.includes(type))
  ) {
    return false;
  }
  if (
    filter.typesIncludeAny !== undefined &&
    !filter.typesIncludeAny.some((typeText) =>
      metadata.types.some((type) => type.includes(typeText)),
    )
  ) {
    return false;
  }
  if (
    filter.names !== undefined &&
    !cardMatchesAnyName(metadata, filter.names)
  ) {
    return false;
  }
  return numericFilterMatches(metadata.power, filter.power);
};

const targetPlayerMatches = (
  controller: PlayerId,
  targetPlayer: "self" | "opponent",
  cardController: PlayerId,
): boolean => {
  if (targetPlayer === "self") return cardController === controller;
  return cardController !== controller;
};

const continuousCounterValueForHandCard = (
  state: GameState,
  card: CardInstance,
): number | undefined => {
  let value: number | undefined;
  for (const effect of allContinuousEffects(state)) {
    const modifier = effect.modifier;
    const target = modifier.target;
    if (
      modifier.layer !== "counterSet" ||
      modifier.operation.type !== "setCounter" ||
      !durationIsActive(state, effect) ||
      target.type !== "allMatching" ||
      target.zone !== "hand" ||
      (target.player !== "self" && target.player !== "opponent") ||
      !targetPlayerMatches(effect.controller, target.player, card.controller) ||
      !handCardMatchesCounterFilter(state, card, target.filter)
    ) {
      continue;
    }
    value = modifier.operation.value;
  }
  return value;
};

export const getEffectiveCharacterCounterValue = (
  state: GameState,
  card: CardInstance,
): number | undefined => {
  const metadata = state.cardManifest.cards[card.cardId];
  if (metadata?.category !== "character") {
    return undefined;
  }
  return continuousCounterValueForHandCard(state, card) ?? metadata.counter;
};
