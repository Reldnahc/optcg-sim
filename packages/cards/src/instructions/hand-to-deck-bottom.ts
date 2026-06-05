import type { SelectionId } from "@optcg/types";

import type { InstructionParser, PrimitiveEvidence } from "../types.js";

const opponentHandToDeckBottomSelection =
  "handSelection:opponent-hand-to-deck-bottom" as SelectionId;
const selfHandToDeckPlacementSelection =
  "handSelection:self-hand-to-deck-placement" as SelectionId;

type DeckPlacement = "top" | "bottom" | "topOrBottom";

const parseDeckPlacement = (text: string): DeckPlacement | undefined => {
  if (text === "top") return "top";
  if (text === "bottom") return "bottom";
  if (text === "top or bottom") return "topOrBottom";
  return undefined;
};

const deckPlacementEvidence = (
  placement: DeckPlacement,
): readonly PrimitiveEvidence[] =>
  placement === "topOrBottom"
    ? ["position:top", "position:bottom"]
    : [`position:${placement}`];

export const parseHandToDeckBottomInstruction: InstructionParser = (input) => {
  const match =
    /^(?:(?<player>your opponent|you) places?|place) (?<count>\d+) cards? from (?<possessive>their|your) hand at the (?<placement>top|bottom|top or bottom) of (?<deckPossessive>their|your) deck(?: in any order)?\.?$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const playerText = match?.groups?.["player"]?.toLowerCase() ?? "you";
  const possessive = match?.groups?.["possessive"]?.toLowerCase();
  const deckPossessive = match?.groups?.["deckPossessive"]?.toLowerCase();
  const placementText = match?.groups?.["placement"]?.toLowerCase();
  if (
    countText === undefined ||
    possessive === undefined ||
    deckPossessive === undefined ||
    placementText === undefined
  ) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);
  if (!Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }
  const placement = parseDeckPlacement(placementText);
  if (placement === undefined) {
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
  const selection =
    player === "opponent"
      ? opponentHandToDeckBottomSelection
      : selfHandToDeckPlacementSelection;

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
            position: placement,
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
      ...deckPlacementEvidence(placement),
      "composition:selectThenMove",
    ],
    rest: "",
  };
};
