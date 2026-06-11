import { parseCardFilterPredicates } from "../../filters/index.js";
import type { InstructionParser } from "../../types.js";
import { parseFieldCostReductionInstruction } from "./field-cost.js";

export const parseModifyCostInstruction: InstructionParser = (input) => {
  const fieldCostReduction = parseFieldCostReductionInstruction(input, {
    condition: undefined,
    requireExplicitDuration: true,
  });
  if (fieldCostReduction !== undefined) {
    return fieldCostReduction;
  }

  const nextUseMatch =
    /^The next time you play\s+(?<filter>.+)\s+from your hand during this turn,\s+the cost will be reduced by (?<value>[1-9]\d*)\.?$/i.exec(
      input.text,
    );
  const nextUseFilterText = nextUseMatch?.groups?.["filter"];
  const nextUseValueText = nextUseMatch?.groups?.["value"];
  if (nextUseFilterText !== undefined && nextUseValueText !== undefined) {
    const predicates = parseCardFilterPredicates({ text: nextUseFilterText });
    if (predicates === undefined || predicates.rest.length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "modifyCost",
        player: "self",
        sourceZone: "hand",
        filter: predicates.filter,
        value: -Number.parseInt(nextUseValueText, 10),
        duration: { type: "thisTurn" },
        usageLimit: {
          type: "nextMatchingPlay",
          maxUses: 1,
        },
      },
      evidence: [
        "instruction:modifyCost",
        ...predicates.evidence,
        "zone:hand",
        "modifier:costReduction",
        "count:positiveInteger",
        "duration:thisTurn",
        "usageLimit:nextMatchingPlay",
      ],
      rest: "",
    };
  }

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
