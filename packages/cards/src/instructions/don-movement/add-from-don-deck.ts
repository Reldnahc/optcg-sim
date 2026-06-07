import { parseUpToCardinality } from "../../cardinality/index.js";
import type { InstructionParser } from "../../types.js";

export const parseAddActiveDonFromDonDeckInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^add (?<quantity>up to [1-9]\d*) DON!! card from your DON!! deck and set it as active\.?$/i.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  if (quantityText === undefined) {
    return undefined;
  }
  const quantity = parseUpToCardinality({ text: quantityText });
  if (quantity === undefined || quantity.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "moveCards",
      min: quantity.cardinality.min,
      count: quantity.cardinality.max,
      from: { player: "self", zone: "donDeck", position: "top" },
      to: { player: "self", zone: "costArea" },
      order: "original",
      destinationState: "active",
    },
    evidence: [
      "instruction:moveCards",
      ...quantity.evidence,
      "player:self",
      "zone:donDeck",
      "position:top",
      "destination:costArea",
      "state:active",
      "filter:category:don",
      "order:original",
    ],
    rest: "",
  };
};

export const parseAddRestedDonFromDonDeckInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^add (?<quantity>up to [1-9]\d*) additional DON!! cards and rest them\.?$/i.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  if (quantityText === undefined) {
    return undefined;
  }
  const quantity = parseUpToCardinality({ text: quantityText });
  if (quantity === undefined || quantity.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "moveCards",
      min: quantity.cardinality.min,
      count: quantity.cardinality.max,
      from: { player: "self", zone: "donDeck", position: "top" },
      to: { player: "self", zone: "costArea" },
      order: "original",
      destinationState: "rested",
    },
    evidence: [
      "instruction:moveCards",
      ...quantity.evidence,
      "player:self",
      "zone:donDeck",
      "position:top",
      "destination:costArea",
      "state:rested",
      "filter:category:don",
      "order:original",
    ],
    rest: "",
  };
};
