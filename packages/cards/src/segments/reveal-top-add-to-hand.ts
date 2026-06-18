import type {
  CardFilter,
  Effect,
  EffectTextSpan,
  SelectionId,
  SelectionSetId,
} from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type {
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { topDeckSearchPresentationSpans } from "./top-deck-presentation-spans.js";

const revealedAddToHandSet = "set:reveal-add-to-hand" as SelectionSetId;
const revealedAddToHandSelection = "revealSelection:addToHand" as SelectionId;

export function revealTopAddToHandExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const selection = parseRevealTopAddToHandSelection(input);
  if (selection === undefined || selection.rest.length > 0) {
    return undefined;
  }

  const selectionEvidence = [
    "expression:sequence",
    "instruction:revealTop",
    "look:topDeck",
    "zone:deck",
    "count:positiveInteger",
    "reveal:bothPlayers",
    "instruction:selectFromSet",
    ...selection.evidence,
    "instruction:moveSelected",
  ] as const;
  const remainingEvidence = [
    "instruction:placeSetRemainder",
    "remaining:rest",
    "remaining:bottomDeck",
    "position:bottom",
    "order:original",
  ] as const;

  return {
    effect: createRevealedSetAddToHandSequence({
      filter: selection.filter,
      max: selection.max,
    }),
    evidence: [...selectionEvidence, ...remainingEvidence],
    rest: "",
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: revealAddToHandPresentationSpans({
            input,
            remainingEvidence,
            selectionEvidence,
          }),
        }),
  };
}

function parseRevealTopAddToHandSelection(input: ParseInput):
  | {
      readonly filter: CardFilter;
      readonly max: number;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const match =
    /^Reveal 1 card from the top of your deck and add up to (?<max>[1-9]\d*) (?<filterText>.+?) to your hand\.\s+Then,\s+place the rest at the bottom of your deck\.?$/iu.exec(
      input.text,
    );
  const maxText = match?.groups?.["max"];
  const filterText = match?.groups?.["filterText"];
  if (maxText === undefined || filterText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: filterText });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  return {
    filter: predicates.filter,
    max: Number.parseInt(maxText, 10),
    evidence: ["cardinality:upTo", ...predicates.evidence],
    rest: "",
  };
}

function createRevealedSetAddToHandSequence({
  filter,
  max,
}: {
  readonly filter: CardFilter;
  readonly max: number;
}): Extract<Effect, { type: "sequence" }> {
  return {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "revealTop",
          player: "self",
          zone: "deck",
          count: 1,
          saveAs: revealedAddToHandSet,
          visibility: "bothPlayers",
        },
      },
      {
        connector: "then",
        effect: {
          type: "selectFromSet",
          set: revealedAddToHandSet,
          chooser: "self",
          min: 0,
          max,
          filter,
          saveAs: revealedAddToHandSelection,
        },
      },
      {
        connector: "ifPreviousSucceeded",
        effect: {
          type: "moveSelected",
          selection: revealedAddToHandSelection,
          from: revealedAddToHandSet,
          to: "hand",
        },
      },
      {
        connector: "then",
        effect: {
          type: "placeSetRemainder",
          set: revealedAddToHandSet,
          owner: "self",
          destination: "deck",
          position: "bottom",
          order: "original",
        },
      },
    ],
  };
}

function revealAddToHandPresentationSpans({
  input,
  remainingEvidence,
  selectionEvidence,
}: {
  readonly input: ParseInput;
  readonly remainingEvidence: readonly PrimitiveEvidence[];
  readonly selectionEvidence: readonly PrimitiveEvidence[];
}): readonly EffectTextSpan[] {
  return topDeckSearchPresentationSpans({
    input,
    remainingEvidence,
    selectionEvidence,
  });
}
