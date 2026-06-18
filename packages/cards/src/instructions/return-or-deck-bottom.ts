import type { Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";
import { selectThenApplyFieldTarget } from "./effect-builders.js";

const returnOrDeckBottomSelectionId = "selected:return-or-deck-bottom";

type CharacterFilter = NonNullable<
  Extract<Target, { type: "choose" }>["request"]["filter"]
>;

const selectThenChooseReturnOrDeckBottom = (
  player: "opponent" | "anyPlayer",
  min: number,
  max: number,
  filter: CharacterFilter,
): Effect =>
  selectThenApplyFieldTarget({
    selectionId: returnOrDeckBottomSelectionId,
    selectId: "select:return-or-deck-bottom",
    player,
    zone: "characterArea",
    filter,
    min,
    max,
    applyConnector: "ifPreviousSucceeded",
    apply: (target) => ({
      type: "choice",
      chooser: "self",
      min: 1,
      max: 1,
      options: [
        {
          id: "selected:return-to-owner-hand",
          label: "Return the selected card to the owner's hand.",
          effect: {
            type: "bounce",
            destination: "hand",
            target,
          },
        },
        {
          id: "selected:owner-deck-bottom",
          label: "Place the selected card at the bottom of the owner's deck.",
          effect: {
            type: "bounce",
            destination: "deckBottom",
            target,
          },
        },
      ],
    }),
  });

export const parseReturnOrDeckBottomInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^return\s+(?<selection>.+?)\s+to the owner's hand or place it at the bottom of their deck\.?$/iu.exec(
      input.text,
    );
  const selectionText = match?.groups?.["selection"];
  if (selectionText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: selectionText });
  if (cardinality === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: cardinality.rest },
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
    effect: selectThenChooseReturnOrDeckBottom(
      "anyPlayer",
      cardinality.cardinality.min,
      cardinality.cardinality.max,
      predicates.filter,
    ),
    evidence: [
      "instruction:returnToOwnerHand",
      "instruction:moveSelected",
      ...cardinality.evidence,
      "chooser:self:upTo",
      "player:any",
      ...predicates.evidence,
      "destination:ownerHand",
      "destination:deck",
      "position:bottom",
      "expression:choice",
      "composition:selectThenApply",
    ],
    rest: "",
  };
};
