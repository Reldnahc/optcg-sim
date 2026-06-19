import type { ContinuousInstructionParser } from "../continuous-field-effects.js";
import { parseCardFilterPredicates } from "../../filters/index.js";
import { negativeModifierSignPattern } from "../../modifiers/signs.js";

const selfHandCostReductionPattern = new RegExp(
  String.raw`^give this card in your hand\s+${negativeModifierSignPattern}(?<value>[1-9]\d*) cost\.?$`,
  "iu",
);

const filteredHandCostReductionPattern = new RegExp(
  String.raw`^give (?<filter>.+?) in your hand\s+${negativeModifierSignPattern}(?<value>[1-9]\d*) cost\.?$`,
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
  if (valueText !== undefined) {
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
  }

  const filteredMatch = filteredHandCostReductionPattern.exec(input.text);
  const filterText = filteredMatch?.groups?.["filter"];
  const filteredValueText = filteredMatch?.groups?.["value"];
  if (filterText === undefined || filteredValueText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: filterText });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyCost",
      player: "self",
      sourceZone: "hand",
      filter: predicates.filter,
      value: -Number.parseInt(filteredValueText, 10),
      duration: {
        type: "whileConditionTrue",
        condition: context.condition,
      },
    },
    evidence: [
      "instruction:modifyCost",
      ...predicates.evidence,
      "zone:hand",
      "modifier:costReduction",
      "count:positiveInteger",
      "duration:whileConditionTrue",
    ],
    rest: "",
  };
};
