import type {
  CardFilter,
  Effect,
  EffectTextSpan,
  SelectionId,
  SelectionSetId,
} from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import { parseRestToTopOrBottomAnyOrder } from "../search/index.js";
import type {
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { topDeckSearchPresentationSpans } from "./top-deck-presentation-spans.js";

const revealedPlaySet = "set:reveal-play" as SelectionSetId;
const revealedPlaySelection = "revealSelection:play" as SelectionId;

export function revealTopPlayExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const play = parseRevealTopPlaySelection(input);
  if (play === undefined) {
    return undefined;
  }

  const remaining = parseRestToTopOrBottomAnyOrder({ text: play.rest });
  if (remaining === undefined || remaining.rest.length > 0) {
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
    ...play.evidence,
    "instruction:playSelected",
  ] as const;
  const remainingEvidence = [
    "instruction:placeSetRemainder",
    ...remaining.evidence,
  ] as const;
  const evidence = [...selectionEvidence, ...remainingEvidence] as const;

  return {
    effect: createRevealedSetPlaySequence({
      filter: play.filter,
      max: play.max,
    }),
    evidence,
    rest: "",
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: revealPlayPresentationSpans({
            input,
            remainingEvidence,
            selectionEvidence,
          }),
        }),
  };
}

function parseRevealTopPlaySelection(input: ParseInput):
  | {
      readonly filter: CardFilter;
      readonly max: number;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const match =
    /^Reveal 1 card from the top of your deck and play up to (?<max>[1-9]\d*) (?<filterText>.+?)(?:\.\s+Then,\s+)(?<remainingText>place the rest.+)$/iu.exec(
      input.text,
    );
  const maxText = match?.groups?.["max"];
  const filterText = match?.groups?.["filterText"];
  const remainingText = match?.groups?.["remainingText"];
  if (
    maxText === undefined ||
    filterText === undefined ||
    remainingText === undefined
  ) {
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
    rest: `Then, ${remainingText}`,
  };
}

function createRevealedSetPlaySequence({
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
          saveAs: revealedPlaySet,
          visibility: "bothPlayers",
        },
      },
      {
        connector: "then",
        effect: {
          type: "selectFromSet",
          set: revealedPlaySet,
          chooser: "self",
          min: 0,
          max,
          filter,
          saveAs: revealedPlaySelection,
        },
      },
      {
        connector: "ifPreviousSucceeded",
        effect: {
          type: "playSelected",
          selection: revealedPlaySelection,
          ignoreCost: true,
        },
      },
      {
        connector: "then",
        effect: {
          type: "placeSetRemainder",
          set: revealedPlaySet,
          owner: "self",
          destination: "deck",
          position: "topOrBottom",
          order: "chooser",
        },
      },
    ],
  };
}

function revealPlayPresentationSpans({
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
