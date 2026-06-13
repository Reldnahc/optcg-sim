import type { SelectionId, SelectionSetId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

const revealedHandSelection =
  "handSelection:revealed-hand-cards" as SelectionId;
const revealedHandSet = "handSelection:revealed-hand-cards" as SelectionSetId;
const firstRevealedChoice =
  "handSelection:first-revealed-hand-card" as SelectionId;
const remainingRevealedChoice =
  "handSelection:remaining-revealed-hand-card" as SelectionId;

export function revealedHandPlayExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const match =
    /^Reveal (?<quantity>up to [1-9]\d*) (?<filter>.+?) from your hand\. Play 1 of the revealed cards(?: and play the other card rested if it has (?<remainingPredicate>.+))?\.?$/iu.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  const filterText = match?.groups?.["filter"];
  if (quantityText === undefined || filterText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: quantityText });
  if (cardinality === undefined || cardinality.rest.length > 0) {
    return undefined;
  }
  const predicates = parseHandRevealFilter(filterText);
  if (predicates === undefined) {
    return undefined;
  }
  const remainingPredicateText = match?.groups?.["remainingPredicate"]
    ?.replace(/\.\s*$/u, "")
    .trim();
  const remainingPredicates =
    remainingPredicateText === undefined
      ? undefined
      : parseCardFilterPredicates({
          text: `card with ${remainingPredicateText}`,
        });
  if (
    remainingPredicates !== undefined &&
    remainingPredicates.rest.length > 0
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: revealedHandSelection,
          effect: {
            type: "selectCards",
            zone: "hand",
            player: "self",
            chooser: "self",
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            saveAs: revealedHandSelection,
            visibility: "bothPlayers",
            filter: predicates.filter,
          },
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            type: "selectFromSet",
            set: revealedHandSet,
            chooser: "self",
            min: 1,
            max: 1,
            saveAs: firstRevealedChoice,
          },
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            type: "playSelected",
            selection: firstRevealedChoice,
            ignoreCost: true,
          },
        },
        ...(remainingPredicates === undefined
          ? []
          : [
              {
                connector: "ifPreviousSucceeded" as const,
                effect: {
                  type: "selectFromSet" as const,
                  set: revealedHandSet,
                  chooser: "self" as const,
                  min: 0,
                  max: 1,
                  filter: remainingPredicates.filter,
                  saveAs: remainingRevealedChoice,
                },
              },
              {
                connector: "ifPreviousSucceeded" as const,
                effect: {
                  type: "playSelected" as const,
                  selection: remainingRevealedChoice,
                  enterRested: true,
                  ignoreCost: true,
                },
              },
            ]),
      ],
    },
    evidence: [
      "expression:sequence",
      "instruction:selectCards",
      "zone:hand",
      "player:self",
      "chooser:self:upTo",
      "reveal:bothPlayers",
      ...cardinality.evidence,
      ...predicates.evidence,
      "instruction:selectFromSet",
      "instruction:playSelected",
      ...(remainingPredicates === undefined
        ? []
        : ([...remainingPredicates.evidence, "state:rested"] as const)),
    ],
    rest: "",
  };
}

function parseHandRevealFilter(
  text: string,
): ReturnType<typeof parseCardFilterPredicates> | undefined {
  const parsed = [text, text.replace(/\s+cards?$/iu, "")].reduce<
    ReturnType<typeof parseCardFilterPredicates> | undefined
  >(
    (result, candidate) =>
      result?.rest.length === 0
        ? result
        : parseCardFilterPredicates({ text: candidate }),
    undefined,
  );
  return parsed?.rest.length === 0 ? parsed : undefined;
}
