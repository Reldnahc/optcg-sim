import type { ContinuousInstructionParser } from "../continuous-field-effects.js";

const costReductionPrefix = String.raw`(?:-|\u2212|\u00e2\u02c6\u2019)`;
const selfHandCostReductionPattern = new RegExp(
  String.raw`^give this card in your hand\s+${costReductionPrefix}(?<value>[1-9]\d*) cost\.?$`,
  "iu",
);

export const parseSelfHandModifyCostInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  if (context.condition === undefined) {
    return undefined;
  }

  const valueText = selfHandCostReductionPattern.exec(input.text)?.groups?.[
    "value"
  ];
  if (valueText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyCost",
      player: "self",
      sourceZone: "hand",
      target: { type: "self" },
      value: -Number.parseInt(valueText, 10),
      duration: {
        type: "whileConditionTrue",
        condition: context.condition,
      },
    },
    evidence: [
      "instruction:modifyCost",
      "target:thisCard",
      "zone:hand",
      "modifier:costReduction",
      "count:positiveInteger",
      "duration:whileConditionTrue",
    ],
    rest: "",
  };
};
