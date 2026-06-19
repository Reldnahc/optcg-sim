import type { CardInstance, GameState } from "@optcg/types";

import {
  allContinuousEffects,
  continuousEffectConditionPasses,
  durationIsActive,
  recordConditionPasses,
} from "./compute-view-continuous.js";
import { cardMatchesContinuousModifierTarget } from "../runtime/continuous/target-matching.js";

export const continuousCostBonusForCard = (
  state: GameState,
  card: CardInstance,
): number => {
  let costBonus = 0;
  const effects = allContinuousEffects(state);

  for (const effect of effects) {
    if (effect.modifier.layer !== "costAdd") continue;
    if (effect.modifier.operation.type !== "addCost") continue;
    if (!durationIsActive(state, effect)) continue;
    if (!recordConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;

    costBonus += effect.modifier.operation.value;
  }

  return costBonus;
};

export const continuousBaseCostForCard = (
  state: GameState,
  card: CardInstance,
): number | undefined => {
  let baseCost: number | undefined;
  const effects = allContinuousEffects(state);

  for (const effect of effects) {
    if (effect.modifier.layer !== "baseCostSet") continue;
    if (effect.modifier.operation.type !== "setBaseCost") continue;
    if (!durationIsActive(state, effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;

    baseCost =
      baseCost === undefined
        ? effect.modifier.operation.value
        : Math.min(baseCost, effect.modifier.operation.value);
  }

  return baseCost;
};
