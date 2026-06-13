import type { CardFilter, SelectionId } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";

const opponentHandToDeckBottomSelection =
  "handSelection:opponent-hand-to-deck-bottom" as SelectionId;
const selfHandToDeckPlacementSelection =
  "handSelection:self-hand-to-deck-placement" as SelectionId;
const opponentTrashToDeckBottomSelection =
  "trashSelection:opponent-trash-to-deck-bottom" as SelectionId;
const selfTrashToDeckPlacementSelection =
  "trashSelection:self-trash-to-deck-placement" as SelectionId;

type DeckPlacement = "top" | "bottom" | "topOrBottom";
type SourceZone = "hand" | "trash";

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
    /^(?:(?<player>your opponent|you|they) places?|place) (?<count>\d+) (?<selection>.+?) from (?<possessive>their|your) (?<zone>hand|trash) at the (?<placement>top|bottom|top or bottom) of (?<deckPossessive>their|your) deck(?: in any order)?\.?$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const selectionText = match?.groups?.["selection"]?.trim();
  const playerText = match?.groups?.["player"]?.toLowerCase() ?? "you";
  const possessive = match?.groups?.["possessive"]?.toLowerCase();
  const zoneText = match?.groups?.["zone"]?.toLowerCase();
  const deckPossessive = match?.groups?.["deckPossessive"]?.toLowerCase();
  const placementText = match?.groups?.["placement"]?.toLowerCase();
  if (
    countText === undefined ||
    selectionText === undefined ||
    possessive === undefined ||
    zoneText === undefined ||
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
  const zone = parseSourceZone(zoneText);
  if (zone === undefined) {
    return undefined;
  }
  const selectionFilter = parseSelectionFilter(selectionText);
  if (selectionFilter === undefined) {
    return undefined;
  }
  const player =
    playerText === "your opponent" || playerText === "they"
      ? "opponent"
      : "self";
  const expectedPossessive = player === "opponent" ? "their" : "your";
  if (
    possessive !== expectedPossessive ||
    deckPossessive !== expectedPossessive
  ) {
    return undefined;
  }
  const selection = selectionFor(player, zone);
  const visibility = zone === "trash" ? "bothPlayers" : "chooserOnly";

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: selection,
          effect: {
            type: "selectCards",
            zone,
            player,
            chooser: player,
            min: count,
            max: count,
            ...(selectionFilter.filter === undefined
              ? {}
              : { filter: selectionFilter.filter }),
            saveAs: selection,
            visibility,
          },
        },
        {
          connector: "then",
          effect: {
            type: "moveSelected",
            selection,
            from: zone,
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
      ...selectionFilter.evidence,
      `zone:${zone}`,
      player === "opponent" ? "player:opponent" : "player:self",
      player === "opponent" ? "chooser:opponent" : "chooser:self",
      "zone:deck",
      ...deckPlacementEvidence(placement),
      "composition:selectThenMove",
    ],
    rest: "",
  };
};

const parseSelectionFilter = (
  text: string,
):
  | {
      readonly filter?: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  if (/^cards?$/iu.test(text)) {
    return { evidence: [] };
  }
  const parsed = parseCardFilterPredicates({ text });
  if (parsed === undefined || parsed.rest.length > 0) {
    return undefined;
  }
  return {
    filter: parsed.filter,
    evidence: parsed.evidence,
  };
};

const parseSourceZone = (text: string): SourceZone | undefined => {
  if (text === "hand" || text === "trash") {
    return text;
  }
  return undefined;
};

const selectionFor = (
  player: "self" | "opponent",
  zone: SourceZone,
): SelectionId => {
  if (zone === "trash") {
    return player === "opponent"
      ? opponentTrashToDeckBottomSelection
      : selfTrashToDeckPlacementSelection;
  }
  return player === "opponent"
    ? opponentHandToDeckBottomSelection
    : selfHandToDeckPlacementSelection;
};
