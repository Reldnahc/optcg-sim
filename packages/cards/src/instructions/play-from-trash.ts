import type { SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";

const trashPlaySelection = "trashSelection:play" as SelectionId;

export const parsePlayFromTrashInstruction: InstructionParser = (input) => {
  const playMatch = /^play\s+(?<rest>.+)$/i.exec(input.text);
  const afterPlay = playMatch?.groups?.["rest"];
  if (afterPlay === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: afterPlay });
  if (cardinality === undefined) {
    return undefined;
  }

  const source = parsePlaySource(cardinality.rest);
  if (source === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:trash-play",
          connector: "always",
          saveResultAs: trashPlaySelection,
          effect: {
            type: "selectCards",
            zone: "trash",
            player: "self",
            chooser: "self",
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            filter: source.filter,
            saveAs: trashPlaySelection,
            visibility: "bothPlayers",
          },
        },
        {
          id: "play:selected-from-trash",
          connector: "ifPossible",
          effect: {
            type: "playSelected",
            selection: trashPlaySelection,
            ignoreCost: true,
            ...(source.enterRested ? { enterRested: true } : {}),
          },
        },
      ],
    },
    evidence: [
      "instruction:playSelected",
      ...cardinality.evidence,
      "zone:trash",
      "player:self",
      "chooser:self:upTo",
      ...source.evidence,
      ...(source.enterRested ? ["state:rested" as const] : []),
      "composition:selectThenPlay",
    ],
    rest: "",
  };
};

function parsePlaySource(text: string):
  | {
      readonly filter: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["filter"];
      readonly evidence: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["evidence"];
      readonly enterRested: boolean;
    }
  | undefined {
  const sourceMatch =
    /^(?<predicates>.+) from your trash(?<rested>\s+rested)?\.?$/i.exec(text);
  const predicateText = sourceMatch?.groups?.["predicates"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: predicateText });
  return predicates === undefined || predicates.rest.length > 0
    ? undefined
    : {
        filter: predicates.filter,
        evidence: predicates.evidence,
        enterRested: sourceMatch?.groups?.["rested"] !== undefined,
      };
}
