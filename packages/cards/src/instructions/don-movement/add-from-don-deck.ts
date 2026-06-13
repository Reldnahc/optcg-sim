import { parseUpToCardinality } from "../../cardinality/index.js";
import type { InstructionParser, InstructionParseResult } from "../../types.js";

type DonDeckMoveOwner = "self" | "opponent";

interface DonDeckMovePrefix {
  readonly owner: DonDeckMoveOwner;
  readonly chooser?: "opponent";
  readonly quantityText: string;
}

const parseDonDeckMovePrefix = (
  text: string,
): DonDeckMovePrefix | undefined => {
  const opponentMay =
    /^your opponent may add (?<count>[1-9]\d*) DON!! cards? from their DON!! deck$/iu.exec(
      text,
    );
  const opponentCount = opponentMay?.groups?.["count"];
  if (opponentCount !== undefined) {
    return {
      owner: "opponent",
      chooser: "opponent",
      quantityText: `up to ${opponentCount}`,
    };
  }

  const self =
    /^add (?<quantity>up to [1-9]\d*) (?:(?<additional>additional) )?DON!! cards?(?<source> from your DON!! deck)?$/iu.exec(
      text,
    );
  const quantityText = self?.groups?.["quantity"];
  if (quantityText === undefined) {
    return undefined;
  }
  const explicitlyFromDonDeck = self?.groups?.["source"] !== undefined;
  const isAdditional = self?.groups?.["additional"] !== undefined;
  if (!explicitlyFromDonDeck && !isAdditional) {
    return undefined;
  }
  return { owner: "self", quantityText };
};

function parseAddDonFromDonDeckInstruction(
  input: Parameters<InstructionParser>[0],
  destinationState: "active" | "rested",
): InstructionParseResult | undefined {
  const destinationPattern =
    destinationState === "active"
      ? "set (?:it|them) as active"
      : "rest (?:it|them)";
  const match = new RegExp(
    `^(?<move>.+?) and ${destinationPattern}(?<delayed> at the end of this turn)?\\.?$`,
    "i",
  ).exec(input.text);
  const moveText = match?.groups?.["move"];
  if (moveText === undefined) {
    return undefined;
  }
  const prefix = parseDonDeckMovePrefix(moveText);
  if (prefix === undefined) {
    return undefined;
  }
  const delayed = match?.groups?.["delayed"] !== undefined;
  const quantity = parseUpToCardinality({ text: prefix.quantityText });
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
            ...(prefix.chooser === undefined
              ? {}
              : { chooser: prefix.chooser }),
            from: { player: prefix.owner, zone: "donDeck", position: "top" },
            to: { player: prefix.owner, zone: "costArea" },
            order: "original",
            destinationState,
          },
        }
      : {
          type: "moveCards",
          min: quantity.cardinality.min,
          count: quantity.cardinality.max,
          ...(prefix.chooser === undefined ? {} : { chooser: prefix.chooser }),
          from: { player: prefix.owner, zone: "donDeck", position: "top" },
          to: { player: prefix.owner, zone: "costArea" },
          order: "original",
          destinationState,
        },
    evidence: [
      "instruction:moveCards",
      ...quantity.evidence,
      prefix.owner === "self" ? "player:self" : "player:opponent",
      ...(prefix.chooser === undefined ? [] : (["chooser:opponent"] as const)),
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
