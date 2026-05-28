import type { InstructionParseResult, InstructionParser } from "../types.js";
import { parseTopDeckLook } from "../search/index.js";

export const parseTopDeckPlacementInstruction: InstructionParser = (
  input,
): InstructionParseResult | undefined => {
  const look = parseTopDeckLook(input);
  if (look === undefined) {
    return undefined;
  }

  if (
    !/^place them at the top or bottom of your deck in any order\.?$/i.test(
      look.rest,
    )
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "placeTopDeckCards",
      player: "self",
      count: look.count,
      destinations: ["top", "bottom"],
      order: "ownerChoice",
    },
    evidence: [
      "instruction:placeTopDeckCards",
      ...look.evidence,
      "position:top",
      "position:bottom",
      "order:anyOrder",
    ],
    rest: "",
  };
};
