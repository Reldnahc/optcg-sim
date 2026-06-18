import type { CardFilter, SelectionId, SelectionSetId } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import { sourceSpan } from "../source-slices.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

const revealedTopSet = "set:revealed-top" as SelectionSetId;
const revealedTopSelection = "revealSelection:play" as SelectionId;

export function revealTopPlayRestedExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const match =
    /^Reveal 1 card from the top of your deck\. If that card is a (?<predicate>.+), you may play that card rested(?:\.\s+Then,\s+place the rest at the bottom of your deck)?\.?$/iu.exec(
      input.text,
    );
  const predicateText = match?.groups?.["predicate"];
  if (predicateText === undefined) {
    return undefined;
  }
  const hasBottomCleanup =
    /\.\s+Then,\s+place the rest at the bottom of your deck\.?$/iu.test(
      input.text,
    );

  const filterText = predicateText.replace(/\bcard\b\s*$/iu, "").trim();
  const predicates = parseCardFilterPredicates({ text: filterText });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  const evidence = [
    "expression:sequence",
    "instruction:revealTop",
    "look:topDeck",
    "zone:deck",
    "count:positiveInteger",
    "reveal:bothPlayers",
    "instruction:selectFromSet",
    ...predicates.evidence,
    "instruction:playSelected",
    "state:rested",
    "composition:selectThenPlay",
    ...(hasBottomCleanup
      ? ([
          "instruction:placeSetRemainder",
          "destination:deck",
          "position:bottom",
          "order:original",
        ] as const)
      : ([] as const)),
  ] as const;
  return {
    effect: revealSelectPlayRested(predicates.filter, hasBottomCleanup),
    evidence,
    rest: "",
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: [
            sourceSpan("span:body", "body", input.source, evidence),
          ],
        }),
  };
}

function revealSelectPlayRested(
  filter: CardFilter,
  hasBottomCleanup: boolean,
): ExpressionParseResult["effect"] {
  const effects: Extract<
    ExpressionParseResult["effect"],
    { type: "sequence" }
  >["effects"] = [
    {
      connector: "always",
      effect: {
        type: "revealTop",
        player: "self",
        count: 1,
        saveAs: revealedTopSet,
        visibility: "bothPlayers",
      },
    },
    {
      connector: "then",
      effect: {
        type: "selectFromSet",
        set: revealedTopSet,
        chooser: "self",
        min: 0,
        max: 1,
        filter,
        saveAs: revealedTopSelection,
      },
    },
    {
      connector: "ifPreviousSucceeded",
      effect: {
        type: "playSelected",
        selection: revealedTopSelection,
        enterRested: true,
        ignoreCost: true,
      },
    },
  ];
  if (hasBottomCleanup) {
    effects.push({
      connector: "then",
      effect: {
        type: "placeSetRemainder",
        set: revealedTopSet,
        owner: "self",
        destination: "deck",
        position: "bottom",
        order: "original",
      },
    });
  }

  return {
    type: "sequence",
    effects,
  };
}
