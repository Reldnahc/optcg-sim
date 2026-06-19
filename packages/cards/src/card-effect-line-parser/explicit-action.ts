import type { Effect } from "@optcg/types";

import {
  parseBasePowerBecomeInstruction,
  parseThisCharacterKeywordGrantInstruction,
} from "../instructions/index.js";
import type { ParseInput } from "../types.js";

const isExplicitActionKeywordDuration = (
  effect: Effect,
): effect is Extract<Effect, { type: "giveKeyword" }> =>
  effect.type === "giveKeyword" &&
  effect.duration.type !== "whileSourceOnField" &&
  effect.duration.type !== "whileConditionTrue";

const isExplicitActionKeywordChoice = (effect: Effect): boolean =>
  effect.type === "choice" &&
  effect.options.every((option) =>
    isExplicitActionKeywordDuration(option.effect),
  );

const isExplicitActionModifierSequence = (effect: Effect): boolean =>
  effect.type === "sequence" &&
  effect.effects.every((segment) => {
    const child = segment.effect;
    return (
      (child.type === "giveKeyword" || child.type === "modifyPower") &&
      child.duration.type !== "whileSourceOnField" &&
      child.duration.type !== "whileConditionTrue"
    );
  });

const isExplicitActionBasePowerEffect = (effect: Effect): boolean => {
  if (effect.type === "setBasePower") {
    return (
      effect.duration.type !== "whileSourceOnField" &&
      effect.duration.type !== "whileConditionTrue"
    );
  }
  if (effect.type === "conditional") {
    return isExplicitActionBasePowerEffect(effect.then);
  }
  return (
    effect.type === "sequence" &&
    effect.effects.every((segment) => {
      const child = segment.effect;
      return (
        (child.type === "setBasePower" || child.type === "sequence") &&
        isExplicitActionBasePowerEffect(child)
      );
    })
  );
};

export const parseExplicitActionKeywordGrantInstruction = (
  input: ParseInput,
) => {
  const parsed = parseThisCharacterKeywordGrantInstruction(input, {
    condition: undefined,
  });
  if (
    parsed === undefined ||
    (!isExplicitActionKeywordDuration(parsed.effect) &&
      !isExplicitActionKeywordChoice(parsed.effect) &&
      !isExplicitActionModifierSequence(parsed.effect))
  ) {
    return undefined;
  }
  return parsed;
};

export const parseExplicitActionBasePowerInstruction = (input: ParseInput) => {
  const parsed = parseBasePowerBecomeInstruction(input, {
    condition: undefined,
  });
  if (parsed === undefined || !isExplicitActionBasePowerEffect(parsed.effect)) {
    return undefined;
  }
  return parsed;
};
