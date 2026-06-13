import type {
  CardFilter,
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  GameState,
} from "@optcg/types";

import { cardMatchesAnyName } from "../../card-name-matching.js";
import {
  allContinuousEffects,
  continuousEffectConditionPasses,
  durationIsActive,
  recordConditionPasses,
} from "./active-effects.js";

const cardMatchesRef = (card: CardInstance, ref: CardRef): boolean =>
  card.instanceId === ref.instanceId &&
  card.cardId === ref.cardId &&
  card.controller === ref.playerId;

type BattleWithCounterPower = NonNullable<GameState["battle"]> & {
  counterPower?: number;
};

const numericFilterMatches = (
  value: number | undefined,
  filter:
    | CardFilter["attachedDon"]
    | CardFilter["baseCost"]
    | CardFilter["cost"]
    | CardFilter["currentPower"]
    | CardFilter["power"],
): boolean => {
  if (filter === undefined) return true;
  if (value === undefined) return false;
  if ("op" in filter) return value === filter.value;
  if (filter.min !== undefined && value < filter.min) return false;
  if (filter.max !== undefined && value > filter.max) return false;
  return true;
};

const filterUsesCurrentPower = (filter: CardFilter | undefined): boolean => {
  if (filter === undefined) return false;
  return (
    filter.currentPower !== undefined ||
    (filter.anyOf !== undefined && filter.anyOf.some(filterUsesCurrentPower))
  );
};

const modifierTargetUsesCurrentPower = (
  effect: ContinuousEffectRecord,
): boolean => {
  const target = effect.modifier.target;
  return target.type === "all" && filterUsesCurrentPower(target.filter);
};

const continuousBasePowerForCard = (
  state: GameState,
  card: CardInstance,
  printedPower: number | undefined,
): number | undefined => {
  let basePower: number | undefined;
  for (const effect of allContinuousEffects(state)) {
    if (effect.modifier.layer !== "basePowerSet") continue;
    if (effect.modifier.operation.type !== "setBasePower") continue;
    if (!durationIsActive(state, effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;

    basePower =
      basePower === undefined
        ? effect.modifier.operation.value
        : Math.max(basePower, effect.modifier.operation.value);
  }
  return basePower ?? printedPower;
};

const continuousPowerBonusForCard = (
  state: GameState,
  card: CardInstance,
): number => {
  let powerBonus = 0;
  for (const effect of allContinuousEffects(state)) {
    if (effect.modifier.layer !== "powerAdd") continue;
    if (effect.modifier.operation.type !== "addPower") continue;
    if (modifierTargetUsesCurrentPower(effect)) continue;
    if (!durationIsActive(state, effect)) continue;
    if (!recordConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;

    powerBonus += effect.modifier.operation.value;
  }
  return powerBonus;
};

const currentPowerForCard = (
  state: GameState,
  card: CardInstance,
  printedPower: number | undefined,
): number | undefined => {
  const basePower = continuousBasePowerForCard(state, card, printedPower);
  if (basePower === undefined) return undefined;
  const donBonus =
    card.controller === state.turn.turnPlayerId
      ? card.attachedDon.length * 1000
      : 0;
  const battle = state.battle as BattleWithCounterPower | undefined;
  const counterBonus =
    battle !== undefined &&
    battle.currentTarget.instanceId === card.instanceId &&
    battle.currentTarget.cardId === card.cardId
      ? (battle.counterPower ?? 0)
      : 0;
  return (
    basePower +
    donBonus +
    counterBonus +
    continuousPowerBonusForCard(state, card)
  );
};

const cardMatchesAllFilter = (
  state: GameState,
  card: CardInstance,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) return true;
  if (
    filter.anyOf !== undefined &&
    !filter.anyOf.some((child) => cardMatchesAllFilter(state, card, child))
  ) {
    return false;
  }
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
    filter.typesNotIncludeAny !== undefined &&
    filter.typesNotIncludeAny.some((typeText) =>
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
    numericFilterMatches(card.attachedDon.length, filter.attachedDon) &&
    numericFilterMatches(metadata.cost, filter.baseCost) &&
    numericFilterMatches(metadata.cost, filter.cost) &&
    (filter.currentPower === undefined ||
      numericFilterMatches(
        currentPowerForCard(state, card, metadata.power),
        filter.currentPower,
      )) &&
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
