import type {
  CardFilter,
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  GameState,
} from "@optcg/types";

import { cardMatchesAnyName } from "../../card-name-matching.js";

const cardMatchesRef = (card: CardInstance, ref: CardRef): boolean =>
  card.instanceId === ref.instanceId &&
  card.cardId === ref.cardId &&
  card.controller === ref.playerId;

const numericFilterMatches = (
  value: number | undefined,
  filter: CardFilter["baseCost"] | CardFilter["cost"] | CardFilter["power"],
): boolean => {
  if (filter === undefined) return true;
  if (value === undefined) return false;
  if ("op" in filter) return value === filter.value;
  if (filter.min !== undefined && value < filter.min) return false;
  if (filter.max !== undefined && value > filter.max) return false;
  return true;
};

const cardMatchesAllFilter = (
  state: GameState,
  card: CardInstance,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) return true;
  const metadata = state.cardManifest.cards[card.cardId];
  if (metadata === undefined) return false;
  if (filter.state !== undefined && filter.state !== card.state) {
    return false;
  }
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
  return (
    numericFilterMatches(metadata.cost, filter.baseCost) &&
    numericFilterMatches(metadata.cost, filter.cost) &&
    numericFilterMatches(metadata.power, filter.power)
  );
};

const cardMatchesAllTarget = (
  state: GameState,
  card: CardInstance,
  effect: ContinuousEffectRecord,
): boolean => {
  const target = effect.modifier.target;
  if (target.type !== "all") return false;
  if (target.zone !== card.zone.zone) return false;
  if (!cardMatchesAllFilter(state, card, target.filter)) return false;
  if (target.player === "self") {
    return card.controller === effect.controller;
  }
  if (target.player === "opponent") {
    return card.controller !== effect.controller;
  }
  return false;
};

export const cardMatchesContinuousModifierTarget = (
  state: GameState,
  card: CardInstance,
  effect: ContinuousEffectRecord,
): boolean => {
  const target = effect.modifier.target;
  if (target.type === "self") {
    return cardMatchesRef(card, effect.source);
  }
  if (target.type === "myLeader") {
    return (
      card.zone.zone === "leaderArea" && card.controller === effect.controller
    );
  }
  if (target.type === "exactCard") {
    const cardZone = card.zone.zone;
    const targetZone = target.card.zone?.zone;
    if (target.binding.family !== "selectedTargets") return false;
    if (
      targetZone !== "leaderArea" &&
      targetZone !== "characterArea" &&
      targetZone !== "stageArea" &&
      targetZone !== "costArea"
    ) {
      return false;
    }
    if (cardZone !== targetZone) return false;
    return cardMatchesRef(card, target.card);
  }
  return cardMatchesAllTarget(state, card, effect);
};
