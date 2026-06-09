import type {
  CardFilter,
  Effect,
  EffectTextSpan,
  SelectionId,
  SelectionSetId,
} from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import {
  parseRestToBottomAnyOrder,
  parseTopDeckLook,
} from "../search/index.js";
import { sourceSpan } from "../source-slices.js";
import type {
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";

const lookedPlaySet = "set:look-play" as SelectionSetId;
const lookedPlaySelection = "revealSelection:play" as SelectionId;

export function lookPlayFromTopExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const look = parseTopDeckLook(input);
  if (look === undefined) {
    return undefined;
  }

  const play = parseLookedSetPlaySelection({ text: look.rest });
  if (play === undefined) {
    return undefined;
  }

  const remaining = parseRestToBottomAnyOrder({ text: play.rest });
  if (remaining === undefined || remaining.rest.length > 0) {
    return undefined;
  }

  const evidence = [
    "expression:sequence",
    "instruction:revealTop",
    ...look.evidence,
    "instruction:selectFromSet",
    ...play.evidence,
    "instruction:playSelected",
    "instruction:placeSetRemainder",
    ...remaining.evidence,
  ] as const;

  return {
    effect: createLookedSetPlaySequence({
      count: look.count,
      filter: play.filter,
      max: play.max,
    }),
    evidence,
    rest: "",
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: lookPlayPresentationSpans({
            input,
            evidence,
          }),
        }),
  };
}

function parseLookedSetPlaySelection(input: ParseInput):
  | {
      readonly filter: CardFilter;
      readonly max: number;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const match =
    /^play up to (?<max>[1-9]\d*) (?<filterText>.+?)(?:\.\s+Then,\s+)(?<remainingText>place the rest.+)$/iu.exec(
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

function createLookedSetPlaySequence({
  count,
  filter,
  max,
}: {
  readonly count: number;
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
          count,
          saveAs: lookedPlaySet,
          visibility: "chooserOnly",
        },
      },
      {
        connector: "then",
        effect: {
          type: "selectFromSet",
          set: lookedPlaySet,
          chooser: "self",
          min: 0,
          max,
          filter,
          saveAs: lookedPlaySelection,
        },
      },
      {
        connector: "ifPreviousSucceeded",
        effect: {
          type: "playSelected",
          selection: lookedPlaySelection,
          ignoreCost: true,
        },
      },
      {
        connector: "then",
        effect: {
          type: "placeSetRemainder",
          set: lookedPlaySet,
          owner: "self",
          destination: "deck",
          position: "bottom",
          order: "chooser",
        },
      },
    ],
  };
}

function lookPlayPresentationSpans({
  input,
  evidence,
}: {
  readonly input: ParseInput;
  readonly evidence: readonly PrimitiveEvidence[];
}): readonly EffectTextSpan[] {
  if (input.source === undefined) {
    return [];
  }

  return [sourceSpan("span:lookPlay", "body", input.source, evidence)];
}
