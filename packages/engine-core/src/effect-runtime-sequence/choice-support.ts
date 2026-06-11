import type { Effect } from "@optcg/types";

type ChoiceEffect = Extract<Effect, { type: "choice" }>;
type SequenceEffect = Extract<Effect, { type: "sequence" }>;

const toSingleEffectSequence = (effect: Effect): SequenceEffect => ({
  type: "sequence",
  effects: [{ connector: "always", effect }],
});

export const choiceOptionSequences = (
  effect: ChoiceEffect,
): readonly SequenceEffect[] =>
  (effect.chooser === "self" || effect.chooser === "opponent") &&
  (effect.min === 0 || effect.min === 1) &&
  effect.max === 1 &&
  effect.min <= effect.max &&
  effect.options.length >= 2
    ? effect.options.map((option) =>
        option.effect.type === "sequence"
          ? option.effect
          : toSingleEffectSequence(option.effect),
      )
    : [];

export const isSupportedChoiceEffect = (
  effect: ChoiceEffect,
  isSupportedOption: (effect: SequenceEffect) => boolean,
): boolean => {
  const options = choiceOptionSequences(effect);
  return options.length >= 2 && options.every(isSupportedOption);
};
