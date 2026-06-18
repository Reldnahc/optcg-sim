import type { CardFilter, SelectCardMax, SelectionId } from "@optcg/types";

import {
  parseAnyNumberCardinality,
  parseExactCardinality,
  parseUpToCardinality,
} from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";

const opponentHandToDeckBottomSelection =
  "handSelection:opponent-hand-to-deck-bottom" as SelectionId;
const selfHandToDeckPlacementSelection =
  "handSelection:self-hand-to-deck-placement" as SelectionId;
const opponentTrashToDeckBottomSelection =
  "trashSelection:opponent-trash-to-deck-bottom" as SelectionId;
export const selfTrashToDeckPlacementSelection =
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
  const handReset = parseReturnAllHandToDeckInstruction(input);
  if (handReset !== undefined) {
    return handReset;
  }

  const shuffle = parseShuffleDeckInstruction(input);
  if (shuffle !== undefined) {
    return shuffle;
  }

  const match =
    /^(?:(?<actor>your opponent|you|they) places?|(?<youMay>you may place)|place) (?<selection>.+?) from (?<possessive>your opponent's|their|your) (?<zone>hand|trash) at the (?<placement>top|bottom|top or bottom) of (?<deckPossessive>their|your) deck(?<order>\s+in any order)?\.?$/i.exec(
      input.text,
    );
  const selectionText = match?.groups?.["selection"]?.trim();
  const actorText = match?.groups?.["actor"]?.toLowerCase() ?? "you";
  const possessive = match?.groups?.["possessive"]?.toLowerCase();
  const zoneText = match?.groups?.["zone"]?.toLowerCase();
  const deckPossessive = match?.groups?.["deckPossessive"]?.toLowerCase();
  const placementText = match?.groups?.["placement"]?.toLowerCase();
  const orderEvidence: readonly PrimitiveEvidence[] =
    match?.groups?.["order"] === undefined ? [] : ["order:anyOrder"];
  if (
    selectionText === undefined ||
    possessive === undefined ||
    zoneText === undefined ||
    deckPossessive === undefined ||
    placementText === undefined
  ) {
    return undefined;
  }

  const cardinality = parseDeckPlacementCardinality(selectionText);
  if (cardinality === undefined) {
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
  const selectionFilter = parseSelectionFilter(cardinality.rest);
  if (selectionFilter === undefined) {
    return undefined;
  }
  const chooser =
    actorText === "your opponent" || actorText === "they" ? "opponent" : "self";
  const player = ownerFromPossessive(possessive);
  const deckOwner = ownerFromDeckPossessive(deckPossessive);
  if (player === undefined || deckOwner === undefined || player !== deckOwner) {
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
            chooser,
            min: cardinality.min,
            max: cardinality.max,
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
      ...cardinality.evidence,
      ...selectionFilter.evidence,
      `zone:${zone}`,
      player === "opponent" ? "player:opponent" : "player:self",
      chooser === "opponent" ? "chooser:opponent" : "chooser:self",
      "zone:deck",
      ...deckPlacementEvidence(placement),
      ...orderEvidence,
      "composition:selectThenMove",
    ],
    rest: "",
  };
};

export const parseReturnAllHandToDeckInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^(?<actor>your opponent|you) returns? all cards in (?<handPossessive>their|your) hand to (?<deckPossessive>their|your) deck and shuffles? (?<shufflePossessive>their|your) deck\.?$/iu.exec(
      input.text,
    );
  const actorText = match?.groups?.["actor"]?.toLowerCase();
  const handPossessive = match?.groups?.["handPossessive"]?.toLowerCase();
  const deckPossessive = match?.groups?.["deckPossessive"]?.toLowerCase();
  const shufflePossessive = match?.groups?.["shufflePossessive"]?.toLowerCase();
  if (
    actorText === undefined ||
    handPossessive === undefined ||
    deckPossessive === undefined ||
    shufflePossessive === undefined
  ) {
    return undefined;
  }

  const player = actorText === "your opponent" ? "opponent" : "self";
  if (
    handPossessive !== possessiveForPlayer(player) ||
    deckPossessive !== possessiveForPlayer(player) ||
    shufflePossessive !== possessiveForPlayer(player)
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "moveCards",
            count: {
              type: "countMatchingZoneCards",
              player,
              zone: "hand",
              per: 1,
              multiplier: 1,
            },
            from: { player, zone: "hand" },
            to: { player, zone: "deck" },
            order: "original",
          },
        },
        {
          connector: "then",
          effect: { type: "shuffleDeck", player },
        },
      ],
    },
    evidence: [
      "instruction:moveCards",
      "cardinality:all",
      "value:dynamic:matchingZoneCards",
      "zone:hand",
      "zone:deck",
      player === "opponent" ? "player:opponent" : "player:self",
      "instruction:shuffleDeck",
      "composition:sequence",
    ],
    rest: "",
  };
};

export const parseShuffleDeckInstruction: InstructionParser = (input) => {
  const normalized = input.text.replace(/\.$/u, "").trim().toLowerCase();
  const player =
    normalized === "shuffle your deck" || normalized === "you shuffle your deck"
      ? "self"
      : normalized === "your opponent shuffles their deck"
        ? "opponent"
        : undefined;
  if (player === undefined) {
    return undefined;
  }

  return {
    effect: { type: "shuffleDeck", player },
    evidence: [
      "instruction:shuffleDeck",
      "zone:deck",
      player === "opponent" ? "player:opponent" : "player:self",
    ],
    rest: "",
  };
};

const parseDeckPlacementCardinality = (
  text: string,
):
  | {
      readonly min: number;
      readonly max: SelectCardMax;
      readonly rest: string;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  const anyNumber = parseAnyNumberCardinality({ text });
  if (anyNumber !== undefined && anyNumber.rest.length > 0) {
    return {
      min: anyNumber.cardinality.min,
      max: anyNumber.cardinality.max,
      rest: anyNumber.rest,
      evidence: anyNumber.evidence,
    };
  }
  const upTo = parseUpToCardinality({ text });
  if (upTo !== undefined && upTo.rest.length > 0) {
    return {
      min: upTo.cardinality.min,
      max: upTo.cardinality.max,
      rest: upTo.rest,
      evidence: upTo.evidence,
    };
  }
  const exact = parseExactCardinality({ text });
  if (exact === undefined || exact.rest.length === 0) {
    return undefined;
  }
  return {
    min: exact.count,
    max: exact.count,
    rest: exact.rest,
    evidence: exact.evidence,
  };
};

const ownerFromPossessive = (text: string): "self" | "opponent" | undefined => {
  if (text === "your") return "self";
  if (text === "their" || text === "your opponent's") return "opponent";
  return undefined;
};

const ownerFromDeckPossessive = (
  text: string,
): "self" | "opponent" | undefined => {
  if (text === "your") return "self";
  if (text === "their") return "opponent";
  return undefined;
};

const possessiveForPlayer = (player: "self" | "opponent"): "your" | "their" =>
  player === "self" ? "your" : "their";

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
