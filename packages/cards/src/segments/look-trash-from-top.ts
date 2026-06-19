import type {
  Effect,
  EffectTextSpan,
  SelectionId,
  SelectionSetId,
} from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import {
  parseRestToBottomAnyOrder,
  parseTopDeckLook,
} from "../search/index.js";
import type {
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { topDeckSearchPresentationSpans } from "./top-deck-presentation-spans.js";

const lookedTrashSet = "set:look-trash" as SelectionSetId;
const lookedTrashSelection = "revealSelection:trash" as SelectionId;

export function lookTrashFromTopExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const look = parseTopDeckLook(input);
  if (look === undefined) {
    return undefined;
  }

  const selection = parseTrashSelection({ text: look.rest });
  if (selection === undefined) {
    return undefined;
  }

  const remaining = parseRestToBottomAnyOrder({ text: selection.rest });
  if (remaining === undefined || remaining.rest.length > 0) {
    return undefined;
  }

  const selectionEvidence = [
    "expression:sequence",
    "instruction:revealTop",
    ...look.evidence,
    "instruction:selectFromSet",
    ...selection.evidence,
    "instruction:moveSelected",
    "destination:trash",
  ] as const;
  const remainingEvidence = [
    "instruction:placeSetRemainder",
    ...remaining.evidence,
  ] as const;

  return {
    effect: createLookedSetTrashSequence({
      count: look.count,
      max: selection.max,
    }),
    evidence: [...selectionEvidence, ...remainingEvidence],
    rest: "",
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: lookTrashPresentationSpans({
            input,
            remainingEvidence,
            selectionEvidence,
          }),
        }),
  };
}

function parseTrashSelection(input: ParseInput):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly max: number;
      readonly rest: string;
    }
  | undefined {
  const match =
    /^(?:and\s+)?trash\s+(?<cardinality>up to [1-9]\d* cards?)\.\s+(?<rest>Then,\s+.+)$/iu.exec(
      input.text,
    );
  const cardinalityText = match?.groups?.["cardinality"];
  const rest = match?.groups?.["rest"];
  if (cardinalityText === undefined || rest === undefined) {
    return undefined;
  }
  const cardinality = parseUpToCardinality({ text: cardinalityText });
  if (
    cardinality === undefined ||
    !/^cards?$/iu.test(cardinality.rest.trim())
  ) {
    return undefined;
  }
  return {
    evidence: cardinality.evidence,
    max: cardinality.cardinality.max,
    rest,
  };
}

function createLookedSetTrashSequence({
  count,
  max,
}: {
  readonly count: number;
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
          saveAs: lookedTrashSet,
          visibility: "chooserOnly",
        },
      },
      {
        connector: "then",
        effect: {
          type: "selectFromSet",
          set: lookedTrashSet,
          chooser: "self",
          min: 0,
          max,
          saveAs: lookedTrashSelection,
        },
      },
      {
        connector: "ifPreviousSucceeded",
        effect: {
          type: "moveSelected",
          selection: lookedTrashSelection,
          from: lookedTrashSet,
          to: "trash",
        },
      },
      {
        connector: "then",
        effect: {
          type: "placeSetRemainder",
          set: lookedTrashSet,
          owner: "self",
          destination: "deck",
          position: "bottom",
          order: "chooser",
        },
      },
    ],
  };
}

function lookTrashPresentationSpans({
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
