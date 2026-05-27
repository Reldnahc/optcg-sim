import type { SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";

const trashToHandSelection = "trashSelection:addToHand" as SelectionId;

export const parseAddFromTrashToHandInstruction: InstructionParser = (
  input,
) => {
  const addMatch = /^add\s+(?<rest>.+)$/i.exec(input.text);
  const afterAdd = addMatch?.groups?.["rest"];
  if (afterAdd === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: afterAdd });
  if (cardinality === undefined) {
    return undefined;
  }

  const source = parseTrashToHandSource(cardinality.rest);
  if (source === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:trash-to-hand",
          connector: "always",
          saveResultAs: trashToHandSelection,
          effect: {
            type: "selectCards",
            zone: "trash",
            player: "self",
            chooser: "self",
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            filter: source.filter,
            saveAs: trashToHandSelection,
            visibility: "bothPlayers",
          },
        },
        {
          id: "move:selected-trash-to-hand",
          connector: "then",
          effect: {
            type: "moveSelected",
            selection: trashToHandSelection,
            from: "trash",
            to: "hand",
          },
        },
      ],
    },
    evidence: [
      "instruction:moveSelected",
      ...cardinality.evidence,
      "zone:trash",
      "destination:hand",
      "player:self",
      "chooser:self:upTo",
      ...source.evidence,
    ],
    rest: "",
  };
};

function parseTrashToHandSource(text: string):
  | {
      readonly filter: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["filter"];
      readonly evidence: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["evidence"];
    }
  | undefined {
  const sourceMatch =
    /^(?<predicates>.+) from your trash to your hand\.?$/i.exec(text);
  const predicateText = sourceMatch?.groups?.["predicates"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: predicateText });
  return predicates === undefined || predicates.rest.length > 0
    ? undefined
    : { filter: predicates.filter, evidence: predicates.evidence };
}
