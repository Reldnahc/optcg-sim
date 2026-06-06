import type { SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";

const trashSelection = "trashSelection:choose-destination" as SelectionId;

export const parseSelectFromTrashChoiceInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^Select (?<quantity>up to [1-9]\d*) (?<filter>.+) from your trash and play it or add it to the top of your Life cards(?<faceUp> face-up)?\.?$/iu.exec(
      input.text,
    );
  if (match === null) {
    return undefined;
  }
  const quantityText = match.groups?.["quantity"];
  const filterText = match.groups?.["filter"];
  if (quantityText === undefined || filterText === undefined) {
    return undefined;
  }

  const quantity = parseUpToCardinality({ text: quantityText });
  const filter = parseCardFilterPredicates({ text: filterText });
  if (
    quantity === undefined ||
    quantity.rest.length > 0 ||
    filter === undefined ||
    filter.rest.length > 0
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:trash-choice",
          connector: "always",
          saveResultAs: trashSelection,
          effect: {
            type: "selectCards",
            zone: "trash",
            player: "self",
            chooser: "self",
            min: quantity.cardinality.min,
            max: quantity.cardinality.max,
            filter: filter.filter,
            saveAs: trashSelection,
            visibility: "bothPlayers",
          },
        },
        {
          id: "choose:selected-trash-destination",
          connector: "ifPossible",
          effect: {
            type: "choice",
            chooser: "self",
            min: 1,
            max: 1,
            options: [
              {
                id: "choice:play",
                label: "Play selected card.",
                effect: {
                  type: "playSelected",
                  selection: trashSelection,
                  ignoreCost: true,
                },
              },
              {
                id: "choice:life",
                label: "Add selected card to Life.",
                effect: {
                  type: "moveSelected",
                  selection: trashSelection,
                  from: "trash",
                  to: "life",
                  position: "top",
                  ...(match.groups?.["faceUp"] === undefined
                    ? {}
                    : { destinationFaceUp: true }),
                },
              },
            ],
          },
        },
      ],
    },
    evidence: [
      "instruction:selectCards",
      "instruction:playSelected",
      "instruction:moveSelected",
      ...quantity.evidence,
      "zone:trash",
      "destination:life",
      "position:top",
      ...filter.evidence,
      "composition:selectThenMove",
      "composition:chooseOne",
    ],
    rest: "",
  };
};
