import type { InstructionParseResult, InstructionParser } from "../types.js";
import { parseTopDeckLook } from "../search/index.js";

export const parseTopDeckPlacementInstruction: InstructionParser = (
  input,
): InstructionParseResult | undefined => {
  const look = parseTopDeckLook(input);
  if (look === undefined) {
    return undefined;
  }

  const placement = parsePlacementText(look.rest);
  if (placement === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "placeTopDeckCards",
      player: "self",
      count: look.count,
      destination: placement.destination,
      order: "ownerChoice",
    },
    evidence: [
      "instruction:placeTopDeckCards",
      ...look.evidence,
      ...placement.evidence,
      "order:anyOrder",
    ],
    rest: "",
  };
};

const parsePlacementText = (
  text: string,
):
  | {
      readonly destination: "top" | "bottom" | "topOrBottom";
      readonly evidence:
        | readonly ["position:top"]
        | readonly ["position:top", "position:bottom"];
    }
  | undefined => {
  if (
    /^place them at the top or bottom of your deck in any order\.?$/i.test(text)
  ) {
    return {
      destination: "topOrBottom",
      evidence: ["position:top", "position:bottom"],
    };
  }
  if (/^place them at the top of your deck in any order\.?$/i.test(text)) {
    return { destination: "top", evidence: ["position:top"] };
  }
  return undefined;
};
