import type { SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";

const trashSelection = "trashSelection:choose-destination" as SelectionId;
const handSelection = "handSelection:choose-destination" as SelectionId;

export const parseSelectFromTrashChoiceInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^Select (?<quantity>up to [1-9]\d*) (?<filter>.+) from your (?<source>hand|trash) and play it or add it to the top of your Life cards(?<faceUp> face-up)?\.?$/iu.exec(
      input.text,
    );
  if (match === null) {
    return undefined;
  }
  const quantityText = match.groups?.["quantity"];
  const filterText = match.groups?.["filter"];
  const sourceText = match.groups?.["source"];
  if (
    quantityText === undefined ||
    filterText === undefined ||
    sourceText === undefined
  ) {
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
  const source =
    sourceText.toLowerCase() === "hand"
      ? ({
          zone: "hand" as const,
          selection: handSelection,
          visibility: "chooserOnly" as const,
          selectId: "select:hand-choice",
          choiceId: "choose:selected-hand-destination",
          evidence: "zone:hand" as const,
        } as const)
      : ({
          zone: "trash" as const,
          selection: trashSelection,
          visibility: "bothPlayers" as const,
          selectId: "select:trash-choice",
          choiceId: "choose:selected-trash-destination",
          evidence: "zone:trash" as const,
        } as const);
  const destinationFaceUp = match.groups?.["faceUp"] !== undefined;

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: source.selectId,
          connector: "always",
          saveResultAs: source.selection,
          effect: {
            type: "selectCards",
            zone: source.zone,
            player: "self",
            chooser: "self",
            min: quantity.cardinality.min,
            max: quantity.cardinality.max,
            filter: filter.filter,
            saveAs: source.selection,
            visibility: source.visibility,
          },
        },
        {
          id: source.choiceId,
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
                  selection: source.selection,
                  ignoreCost: true,
                },
              },
              {
                id: "choice:life",
                label: "Add selected card to Life.",
                effect: {
                  type: "moveSelected",
                  selection: source.selection,
                  from: source.zone,
                  to: "life",
                  position: "top",
                  ...(destinationFaceUp ? { destinationFaceUp: true } : {}),
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
      source.evidence,
      "destination:life",
      ...(destinationFaceUp ? (["destination:faceUp"] as const) : []),
      "position:top",
      ...filter.evidence,
      "composition:selectThenMove",
      "composition:chooseOne",
    ],
    rest: "",
  };
};
