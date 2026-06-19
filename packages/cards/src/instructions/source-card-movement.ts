import type { InstructionParser } from "../types.js";

export const parseAddThisCardToHandInstruction: InstructionParser = (input) => {
  const match = /^add this (?<kind>Character )?card to your hand\.?$/iu.exec(
    input.text.trim(),
  );
  if (match === null) {
    return undefined;
  }
  const isCharacterCard = match.groups?.["kind"] !== undefined;

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
      isCharacterCard ? "target:thisCharacter" : "target:thisCard",
      "zone:trash",
      "destination:hand",
      "order:original",
    ],
    rest: "",
  };
};
