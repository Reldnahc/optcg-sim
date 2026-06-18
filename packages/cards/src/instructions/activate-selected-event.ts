import type { HandSelectionId, SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { parseReferencedEffectEntryPointText } from "../references/effect-entry-point.js";
import type { InstructionParser } from "../types.js";

const handEventActivationSelection =
  "handSelection:activate-event" as HandSelectionId;
const trashEventActivationSelection =
  "trashSelection:activate-event" as SelectionId;

export const parseActivateSelectedEventInstruction: InstructionParser = (
  input,
) => {
  const activateMatch = /^activate\s+(?<rest>.+)$/i.exec(input.text);
  const afterActivate = activateMatch?.groups?.["rest"];
  if (afterActivate === undefined) {
    return undefined;
  }

  const referencedEntryPoint =
    parseReferencedEffectEntryPointText(afterActivate);
  const sourceText = referencedEntryPoint?.rest ?? afterActivate;
  const cardinality = parseUpToCardinality({ text: sourceText });
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
            zone: source.zone,
            player: "self",
            chooser: "self",
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            filter: source.filter,
            saveAs: source.selection,
            visibility: source.zone === "hand" ? "chooserOnly" : "bothPlayers",
          },
        },
        {
          id: "activate:selected-event-from-hand",
          connector: "ifPossible",
          effect: {
            type: "activateSelectedEvent",
            selection: source.selection,
            ...(source.zone === "trash"
              ? { sourceZone: "trash" as const }
              : {}),
            trigger: referencedEntryPoint?.trigger ?? { type: "main" },
            ignoreCost: true,
          },
        },
      ],
    },
    evidence: [
      "instruction:activateSelectedEvent",
      ...cardinality.evidence,
      source.zone === "hand" ? "zone:hand" : "zone:trash",
      "player:self",
      "chooser:self:upTo",
      ...source.evidence,
      ...(referencedEntryPoint?.evidence ?? ["reference:eventMain"]),
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
      readonly selection: SelectionId;
      readonly zone: "hand" | "trash";
    }
  | undefined {
  const sourceMatch =
    /^(?<predicates>.+) (?:from your hand|in your trash)\.?$/i.exec(text);
  const predicateText = sourceMatch?.groups?.["predicates"];
  if (predicateText === undefined) {
    return undefined;
  }
  const zone = /\bin your trash\.?$/iu.test(text) ? "trash" : "hand";

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
    selection:
      zone === "hand"
        ? handEventActivationSelection
        : trashEventActivationSelection,
    zone,
  };
}

const eventFilterIsExplicit = (
  filter: NonNullable<ReturnType<typeof parseCardFilterPredicates>>["filter"],
): boolean =>
  filter.categories?.includes("event") === true ||
  filter.anyOf?.some(
    (child) => child.categories?.includes("event") === true,
  ) === true;
