import { parseExactCardinality } from "../../../cardinality/index.js";
import { parseCardFilterPredicates } from "../../../filters/index.js";
import {
  replacementOwnerDeckBottomSelectionId,
  type ReplacementInsteadParseResult,
} from "../shared.js";

export function parseMoveToOwnerDeckBottomInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may place (?<selection>.+?) at the bottom of the owner's deck instead\.?$/iu.exec(
      text.trim(),
    );
  const selectionText = match?.groups?.["selection"];
  if (selectionText === undefined) {
    return undefined;
  }

  const cardinality = parseExactCardinality({ text: selectionText });
  const targetText = cardinality?.rest;
  if (cardinality === undefined || targetText === undefined) {
    return undefined;
  }

  const filterText = /^of your (?<filter>.+)$/iu.exec(targetText)?.groups?.[
    "filter"
  ];
  if (filterText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: filterText },
    { powerSemantics: "current" },
  );
  if (
    predicates === undefined ||
    predicates.rest.length > 0 ||
    predicates.filter.categories?.[0] !== "character"
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:owner-deck-bottom",
          connector: "always",
          saveResultAs: replacementOwnerDeckBottomSelectionId,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zone: "characterArea",
              min: cardinality.count,
              max: cardinality.count,
              allowFewerIfUnavailable: false,
              visibility: "public",
              filter: predicates.filter,
            },
          },
        },
        {
          connector: "then",
          effect: {
            type: "bounce",
            destination: "deckBottom",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: replacementOwnerDeckBottomSelectionId,
              },
              zone: "characterArea",
              player: "self",
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
          },
        },
      ],
    },
    evidence: [
      "instruction:moveSelected",
      ...cardinality.evidence,
      "chooser:self:upTo",
      "player:self",
      "target:yourCharacters",
      "zone:characterArea",
      ...predicates.evidence,
      "destination:deck",
      "position:bottom",
      "composition:selectThenApply",
    ],
  };
}
