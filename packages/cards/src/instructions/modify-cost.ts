import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";

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
