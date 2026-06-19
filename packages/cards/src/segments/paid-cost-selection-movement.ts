import type { SelectionId } from "@optcg/types";

import type { ExpressionParseResult, ParseInput } from "../types.js";

const paidCostSelection = "paidCost" as SelectionId;

export const paidCostSelectionMovementExpressionParser = (
  input: ParseInput,
): ExpressionParseResult | undefined => {
  const match =
    /^place the (?:revealed|selected) cards? at the (?<position>top|bottom) of your deck\.?$/iu.exec(
      input.text,
    );
  const position = match?.groups?.["position"];
  if (position !== "top" && position !== "bottom") {
    return undefined;
  }

  return {
    effect: {
      type: "moveSelected",
      selection: paidCostSelection,
      from: "currentZone",
      to: "deck",
      position,
    },
    evidence: [
      "instruction:moveSelected",
      "reference:paidCost",
      "destination:deck",
      position === "top" ? "position:top" : "position:bottom",
    ],
    rest: "",
  };
};
