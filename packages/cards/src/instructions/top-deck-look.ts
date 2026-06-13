import type { SelectionSetId } from "@optcg/types";

import type { InstructionParser, PrimitiveEvidence } from "../types.js";

const opponentTopDeckLookSet = "set:opponent-top-deck-look" as SelectionSetId;
const selfTopDeckLookSet = "set:self-top-deck-look" as SelectionSetId;

export const parseTopDeckLookInstruction: InstructionParser = (input) => {
  const match =
    /^look at (?<count>[1-9]\d*) cards? from the top of (?<owner>your|your opponent's) deck\.?$/iu.exec(
      input.text.trim(),
    );
  const countText = match?.groups?.["count"];
  const ownerText = match?.groups?.["owner"];
  if (countText === undefined || ownerText === undefined) {
    return undefined;
  }

  const count = Number.parseInt(countText, 10);
  const player = ownerText === "your" ? "self" : "opponent";
  const saveAs =
    player === "self" ? selfTopDeckLookSet : opponentTopDeckLookSet;
  const playerEvidence =
    player === "self"
      ? (["player:self"] as const)
      : (["player:opponent"] as const);

  return {
    effect: {
      type: "revealTop",
      player,
      zone: "deck",
      count,
      saveAs,
      visibility: "chooserOnly",
    },
    evidence: [
      "instruction:revealTop",
      "look:topDeck",
      "zone:deck",
      "count:positiveInteger",
      "reveal:chooserOnly",
      ...playerEvidence,
    ] satisfies PrimitiveEvidence[],
    rest: "",
  };
};
