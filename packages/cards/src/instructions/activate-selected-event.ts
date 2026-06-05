import type { HandSelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";

const handEventActivationSelection =
  "handSelection:activate-event" as HandSelectionId;

export const parseActivateSelectedEventInstruction: InstructionParser = (
  input,
) => {
  const activateMatch = /^activate\s+(?<rest>.+)$/i.exec(input.text);
  const afterActivate = activateMatch?.groups?.["rest"];
  if (afterActivate === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: afterActivate });
  if (cardinality === undefined) {
    return undefined;
  }

  const source = parseActivateEventSource(cardinality.rest);
  if (source === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:hand-event-activation",
          connector: "always",
          saveResultAs: handEventActivationSelection,
          effect: {
            type: "selectCards",
            zone: "hand",
            player: "self",
            chooser: "self",
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            filter: source.filter,
            saveAs: handEventActivationSelection,
            visibility: "chooserOnly",
          },
        },
        {
          id: "activate:selected-event-from-hand",
          connector: "ifPossible",
          effect: {
            type: "activateSelectedEvent",
            selection: handEventActivationSelection,
            trigger: { type: "main" },
            ignoreCost: true,
          },
        },
      ],
    },
    evidence: [
      "instruction:activateSelectedEvent",
      ...cardinality.evidence,
      "zone:hand",
      "player:self",
      "chooser:self:upTo",
      ...source.evidence,
      "reference:eventMain",
      "composition:selectThenActivate",
    ],
    rest: "",
  };
};

function parseActivateEventSource(text: string):
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
  if (
    predicates === undefined ||
    predicates.rest.length > 0 ||
    !eventFilterIsExplicit(predicates.filter)
  ) {
    return undefined;
  }

  return {
    filter: predicates.filter,
    evidence: predicates.evidence,
  };
}

const eventFilterIsExplicit = (
  filter: NonNullable<ReturnType<typeof parseCardFilterPredicates>>["filter"],
): boolean =>
  filter.categories?.includes("event") === true ||
  filter.anyOf?.some(
    (child) => child.categories?.includes("event") === true,
  ) === true;
