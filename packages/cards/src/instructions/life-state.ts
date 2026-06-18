import type { InstructionParser } from "../types.js";

export const parseLifeStateInstruction: InstructionParser = (input) => {
  if (
    /^look at up to 1 card from the top of (?:your|yours) or your opponent's Life cards,? and place it at the top or bottom of the Life cards\.?$/iu.test(
      input.text,
    )
  ) {
    return {
      effect: {
        type: "placeTopLifeCard",
        players: ["self", "opponent"],
        viewer: "self",
        position: "topOrBottom",
      },
      evidence: [
        "instruction:lookAt",
        "zone:life",
        "cardinality:upTo",
        "count:positiveInteger",
        "player:self",
        "player:opponent",
        "visibility:private",
        "position:top",
        "position:bottom",
      ],
      rest: "",
    };
  }

  if (
    /^look at all (?:of )?your Life cards and place them back in your Life area in any order\.?$/iu.test(
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
