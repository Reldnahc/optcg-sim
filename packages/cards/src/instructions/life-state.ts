import type { InstructionParser } from "../types.js";

export const parseLifeStateInstruction: InstructionParser = (input) => {
  if (
    /^look at all of your Life cards and place them back in your Life area in any order\.?$/iu.test(
      input.text,
    )
  ) {
    return {
      effect: { type: "reorderLife", player: "self", viewer: "self" },
      evidence: [
        "instruction:reorder",
        "player:self",
        "zone:life",
        "visibility:private",
        "order:anyOrder",
      ],
      rest: "",
    };
  }

  if (
    /^look at all of your opponent's Life cards and place them back in their Life area in any order\.?$/iu.test(
      input.text,
    )
  ) {
    return {
      effect: { type: "reorderLife", player: "opponent", viewer: "self" },
      evidence: [
        "instruction:reorder",
        "player:opponent",
        "zone:life",
        "visibility:private",
        "order:anyOrder",
      ],
      rest: "",
    };
  }

  if (/^turn all of your Life cards face-down\.?$/iu.test(input.text)) {
    return {
      effect: { type: "setLifeFaceUp", player: "self", faceUp: false },
      evidence: [
        "instruction:setState",
        "player:self",
        "zone:life",
        "destination:faceDown",
      ],
      rest: "",
    };
  }

  return undefined;
};
