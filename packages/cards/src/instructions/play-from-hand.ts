import type { HandSelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";

const handPlaySelection = "handSelection:play-from-hand" as HandSelectionId;

export const parsePlayFromHandInstruction: InstructionParser = (input) => {
  const playMatch = /^Play\s+(?<rest>.+)$/i.exec(input.text);
  const afterPlay = playMatch?.groups?.["rest"];
  if (afterPlay === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: afterPlay });
  if (cardinality === undefined) {
    return undefined;
  }

  const source = parsePlayFromHandSource(cardinality.rest);
  if (source === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:hand-play",
          connector: "always",
          saveResultAs: handPlaySelection,
          effect: {
            type: "selectCards",
            zone: "hand",
            player: "self",
            chooser: "self",
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            filter: source.filter,
            saveAs: handPlaySelection,
            visibility: "chooserOnly",
          },
        },
        {
          id: "play:selected-from-hand",
          connector: "ifPossible",
          effect: {
            type: "playSelected",
            selection: handPlaySelection,
            ignoreCost: true,
          },
        },
      ],
    },
    evidence: [
      "instruction:playSelected",
      ...cardinality.evidence,
      "zone:hand",
      "player:self",
      "chooser:self:upTo",
      ...source.evidence,
      "composition:selectThenPlay",
    ],
    rest: "",
  };
};

function parsePlayFromHandSource(text: string):
  | {
      readonly filter: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["filter"];
      readonly evidence: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["evidence"];
    }
  | undefined {
  const sourceMatch = /^(?<predicates>.+) from your hand\.?$/i.exec(text);
  const predicateText = sourceMatch?.groups?.["predicates"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: predicateText });
  return predicates === undefined || predicates.rest.length > 0
    ? undefined
    : { filter: predicates.filter, evidence: predicates.evidence };
}
