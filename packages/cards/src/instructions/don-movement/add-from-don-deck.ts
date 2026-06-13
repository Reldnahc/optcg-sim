import { parseUpToCardinality } from "../../cardinality/index.js";
import type { InstructionParser, InstructionParseResult } from "../../types.js";

function parseAddDonFromDonDeckInstruction(
  input: Parameters<InstructionParser>[0],
  destinationState: "active" | "rested",
): InstructionParseResult | undefined {
  const destinationPattern =
    destinationState === "active"
      ? "set (?:it|them) as active"
      : "rest (?:it|them)";
  const match = new RegExp(
    `^add (?<quantity>up to [1-9]\\d*) (?:(?<additional>additional) )?DON!! cards?(?: from your DON!! deck)? and ${destinationPattern}(?<delayed> at the end of this turn)?\\.?$`,
    "i",
  ).exec(input.text);
  const quantityText = match?.groups?.["quantity"];
  if (quantityText === undefined) {
    return undefined;
  }
  const explicitlyFromDonDeck = input.text
    .toLowerCase()
    .includes(" from your don!! deck");
  const isAdditional = match?.groups?.["additional"] !== undefined;
  const delayed = match?.groups?.["delayed"] !== undefined;
  if (!explicitlyFromDonDeck && !isAdditional) {
    return undefined;
  }
  const quantity = parseUpToCardinality({ text: quantityText });
  if (quantity === undefined || quantity.rest.length > 0) {
    return undefined;
  }

  return {
    effect: delayed
      ? {
          type: "delayed",
          timing: { type: "endOfTurn", turn: "current" },
          effect: {
            type: "moveCards",
            min: quantity.cardinality.min,
            count: quantity.cardinality.max,
            from: { player: "self", zone: "donDeck", position: "top" },
            to: { player: "self", zone: "costArea" },
            order: "original",
            destinationState,
          },
        }
      : {
          type: "moveCards",
          min: quantity.cardinality.min,
          count: quantity.cardinality.max,
          from: { player: "self", zone: "donDeck", position: "top" },
          to: { player: "self", zone: "costArea" },
          order: "original",
          destinationState,
        },
    evidence: [
      "instruction:moveCards",
      ...quantity.evidence,
      "player:self",
      "zone:donDeck",
      "position:top",
      "destination:costArea",
      destinationState === "active" ? "state:active" : "state:rested",
      "filter:category:don",
      "order:original",
      ...(delayed
        ? (["duration:endOfTurn", "composition:delayed"] as const)
        : []),
    ],
    rest: "",
  };
}

export const parseAddActiveDonFromDonDeckInstruction: InstructionParser = (
  input,
) => {
  return parseAddDonFromDonDeckInstruction(input, "active");
};

export const parseAddRestedDonFromDonDeckInstruction: InstructionParser = (
  input,
) => {
  return parseAddDonFromDonDeckInstruction(input, "rested");
};
