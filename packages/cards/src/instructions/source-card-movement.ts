import type { InstructionParser } from "../types.js";

export const parseAddThisCardToHandInstruction: InstructionParser = (input) => {
  if (!/^add this card to your hand\.?$/iu.test(input.text.trim())) {
    return undefined;
  }

  return {
    effect: {
      type: "moveCards",
      count: 1,
      from: { player: "self", zone: "trash", source: "effectSource" },
      to: { player: "self", zone: "hand" },
      order: "original",
    },
    evidence: [
      "instruction:moveCards",
      "target:thisCard",
      "zone:trash",
      "destination:hand",
      "order:original",
    ],
    rest: "",
  };
};
