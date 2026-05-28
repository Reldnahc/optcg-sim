import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";
import type { ContinuousInstructionParser } from "./continuous-field-effects.js";

export const modifyCostInstructionPrimitive = {
  primitiveId: "instruction:modifyCost",
  childPrimitiveIds: [
    "filter:type",
    "filter:category:character",
    "filter:cost",
    "zone:hand",
    "modifier:costReduction",
    "duration:whileConditionTrue",
  ],
} as const;

export const parseModifyCostInstruction: InstructionParser = (input) => {
  const match =
    /^The cost of playing\s+(?<filter>.+)\s+from your hand will be reduced by (?<value>[1-9]\d*)\.?$/i.exec(
      input.text,
    );
  const filterText = match?.groups?.["filter"];
  const valueText = match?.groups?.["value"];
  if (filterText === undefined || valueText === undefined) {
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
      value: -Number.parseInt(valueText, 10),
      duration: {
        type: "whileConditionTrue",
        condition: { type: "yourTurn" },
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

export const parseSelfHandModifyCostInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^give this card in your hand\s+[−-](?<value>[1-9]\d*) cost\.?$/i.exec(
      input.text,
    );
  const valueText = match?.groups?.["value"];
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
