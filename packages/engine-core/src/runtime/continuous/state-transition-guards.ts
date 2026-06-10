import type { CardInstance, GameState } from "@optcg/types";

import {
  continuousEffectConditionPasses,
  durationIsActive,
} from "../../view/compute-view-continuous.js";
import { cardMatchesContinuousModifierTarget } from "./target-matching.js";

export const isBecomeActiveRestricted = (
  state: GameState,
  card: CardInstance,
): boolean =>
  state.continuousEffects.some((effect) => {
    if (
      effect.modifier.layer !== "restriction" ||
      effect.modifier.operation.type !== "restriction" ||
      effect.modifier.operation.restriction !== "cannotBecomeActive"
    ) {
      return false;
    }
    return (
      durationIsActive(state, effect) &&
      continuousEffectConditionPasses(state, effect) &&
      cardMatchesContinuousModifierTarget(state, card, effect)
    );
  });

export const canBecomeActive = (
  state: GameState,
  card: CardInstance,
): boolean => !isBecomeActiveRestricted(state, card);
