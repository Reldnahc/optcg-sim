import type {
  CardRef,
  ContinuousEffectRecord,
  Effect,
  GameState,
} from "@optcg/types";

import {
  isSupportedBasePowerDuration,
  isSupportedBasePowerSetFilter,
  isSupportedBasePowerValue,
} from "./support.js";
import { resolveBasePowerValueForController } from "./value-resolution.js";

type SetBasePowerEffect = Extract<Effect, { type: "setBasePower" }>;

export const isSupportedPermanentBasePowerTarget = (
  target: SetBasePowerEffect["target"],
): boolean =>
  target.type === "self" ||
  target.type === "myLeader" ||
  (target.type === "all" &&
    target.zone === "characterArea" &&
    target.player === "self" &&
    isSupportedBasePowerSetFilter(target.filter));

export const isSupportedPermanentBasePowerEffect = (
  effect: SetBasePowerEffect,
): boolean =>
  isSupportedBasePowerValue(effect.value) &&
  isSupportedBasePowerDuration(effect.duration) &&
  isSupportedPermanentBasePowerTarget(effect.target);

export const toPermanentBasePowerModifier = (
  state: GameState,
  source: CardRef,
  effect: SetBasePowerEffect,
  unsupportedMessage: (reason: string) => string,
): ContinuousEffectRecord["modifier"] => {
  if (!isSupportedPermanentBasePowerTarget(effect.target)) {
    throw new TypeError(unsupportedMessage("unsupported base-power target"));
  }
  if (!isSupportedBasePowerDuration(effect.duration)) {
    throw new TypeError(unsupportedMessage("unsupported base-power duration"));
  }
  if (!isSupportedBasePowerValue(effect.value)) {
    throw new TypeError(unsupportedMessage("unsupported base-power value"));
  }
  const value = resolveBasePowerValueForController(
    state,
    source.playerId,
    effect.value,
    {
      controllerId: source.playerId,
      source,
    },
  );
  if (value === null) {
    throw new TypeError(unsupportedMessage("unsupported base-power value"));
  }
  return {
    layer: "basePowerSet",
    target: effect.target,
    operation: { type: "setBasePower", value },
  };
};
