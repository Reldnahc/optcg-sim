import type { SelectionId } from "@optcg/types";

import type { InstructionParser } from "../types.js";

const opponentHandToDeckBottomSelection =
  "handSelection:opponent-hand-to-deck-bottom" as SelectionId;

export const parseHandToDeckBottomInstruction: InstructionParser = (input) => {
  const match =
    /^(?<player>your opponent|you) places? (?<count>\d+) cards? from (?<possessive>their|your) hand at the bottom of (?<deckPossessive>their|your) deck\.?$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const playerText = match?.groups?.["player"]?.toLowerCase();
  const possessive = match?.groups?.["possessive"]?.toLowerCase();
  const deckPossessive = match?.groups?.["deckPossessive"]?.toLowerCase();
  if (
    countText === undefined ||
    playerText === undefined ||
    possessive === undefined ||
    deckPossessive === undefined
  ) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);
  if (!Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }
  const player = playerText === "your opponent" ? "opponent" : "self";
  const expectedPossessive = player === "opponent" ? "their" : "your";
  if (
    possessive !== expectedPossessive ||
    deckPossessive !== expectedPossessive
  ) {
    return undefined;
  }
  const selection = (
    player === "opponent"
      ? opponentHandToDeckBottomSelection
      : "handSelection:self-hand-to-deck-bottom"
  ) as SelectionId;

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: selection,
          effect: {
            type: "selectCards",
            zone: "hand",
            player,
            chooser: player,
            min: count,
            max: count,
            saveAs: selection,
            visibility: "chooserOnly",
          },
        },
        {
          connector: "then",
          effect: {
            type: "moveSelected",
            selection,
            from: "hand",
            to: "deck",
            position: "bottom",
          },
        },
      ],
    },
    evidence: [
      "instruction:moveSelected",
      "cardinality:exact",
      "count:positiveInteger",
      "zone:hand",
      player === "opponent" ? "player:opponent" : "player:self",
      player === "opponent" ? "chooser:opponent" : "chooser:self",
      "zone:deck",
      "position:bottom",
      "composition:selectThenMove",
    ],
    rest: "",
  };
};
