import type { Target } from "@optcg/types";

import type { ConditionParseResult, ConditionParser } from "../types.js";

const chosenCharacterSelectionId = "selected:chosenCharacter";

const chosenCharacterTarget = (): Target => ({
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: chosenCharacterSelectionId,
  },
  zone: "characterArea",
  player: "opponent",
  visibility: "publicOnly",
  onFailure: "failClosed",
});

export const parseSelectedTargetStatComparisonCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const match =
    /^the chosen Character has a cost equal to the number of DON!! cards given to it$/iu.exec(
      input.text,
    );
  if (match === null) {
    return undefined;
  }
  const target = chosenCharacterTarget();

  return {
    condition: {
      type: "cardStatComparison",
      target,
      stat: "cost",
      op: "eq",
      value: {
        type: "countAttachedDon",
        target,
        per: 1,
        multiplier: 1,
      },
    },
    evidence: [
      "condition:cardStatComparison",
      "condition:stat:cost",
      "condition:comparator:eq",
      "value:dynamic:attachedDonCount",
      "composition:savedTargetCondition",
    ],
    rest: "",
  };
};

export { chosenCharacterSelectionId, chosenCharacterTarget };
