import type { SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";

const trashToLifeSelection = "trashSelection:addToLife" as SelectionId;

export const parseAddFromTrashToLifeInstruction: InstructionParser = (
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

  const source = parseTrashToLifeSource(cardinality.rest);
  if (source === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:trash-to-life",
          connector: "always",
          saveResultAs: trashToLifeSelection,
          effect: {
            type: "selectCards",
            zone: "trash",
            player: "self",
            chooser: "self",
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            filter: source.filter,
            saveAs: trashToLifeSelection,
            visibility: "bothPlayers",
          },
        },
        {
          id: "move:selected-trash-to-life",
          connector: "ifPossible",
          effect: {
            type: "moveSelected",
            selection: trashToLifeSelection,
            from: "trash",
            to: "life",
            position: source.position,
            ...(source.destinationFaceUp === true
              ? { destinationFaceUp: true }
              : {}),
          },
        },
      ],
    },
    evidence: [
      "instruction:selectCards",
      "instruction:moveSelected",
      ...cardinality.evidence,
      "zone:trash",
      "destination:life",
      source.position === "top" ? "position:top" : "position:bottom",
      ...(source.destinationFaceUp === true
        ? (["destination:faceUp"] as const)
        : []),
      "player:self",
      "chooser:self:upTo",
      ...source.evidence,
      "composition:selectThenMove",
    ],
    rest: "",
  };
};

function parseTrashToLifeSource(text: string):
  | {
      readonly destinationFaceUp?: true;
      readonly filter: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["filter"];
      readonly evidence: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["evidence"];
      readonly position: "top" | "bottom";
    }
  | undefined {
  const sourceMatch =
    /^(?<predicates>.+) from your trash to the (?<position>top|bottom) of your Life cards(?<faceUp> face-up)?\.?$/i.exec(
      text,
    );
  const predicateText = sourceMatch?.groups?.["predicates"];
  const position = sourceMatch?.groups?.["position"];
  if (
    predicateText === undefined ||
    (position !== "top" && position !== "bottom")
  ) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: predicateText });
  return predicates === undefined || predicates.rest.length > 0
    ? undefined
    : {
        ...(sourceMatch?.groups?.["faceUp"] === undefined
          ? {}
          : { destinationFaceUp: true as const }),
        filter: predicates.filter,
        evidence: predicates.evidence,
        position,
      };
}
