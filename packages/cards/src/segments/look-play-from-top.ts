import type {
  CardFilter,
  Effect,
  EffectTextSpan,
  SelectionId,
  SelectionSetId,
} from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseFieldCardCountCondition } from "../conditions/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { parseTrashFromHandInstruction } from "../instructions/index.js";
import {
  parseRestToBottomAnyOrder,
  parseSearchCardFilter,
  parseSearchSelectionVerb,
  parseTopDeckLook,
} from "../search/index.js";
import type {
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { parseLeadingConditionalExpression } from "./composed-expression.js";
import { topDeckSearchPresentationSpans } from "./top-deck-presentation-spans.js";

const lookedPlaySet = "set:look-play" as SelectionSetId;
const lookedPlaySelection = "revealSelection:play" as SelectionId;
const lookedLifeSelection = "revealSelection:life" as SelectionId;

export function lookPlayFromTopExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const look = parseTopDeckLook(input);
  if (look === undefined) {
    return undefined;
  }

  const play = parseLookedSetPlaySelection({ text: look.rest });
  if (play !== undefined) {
    const remaining = parseRestToBottomAnyOrder({ text: play.rest });
    if (remaining === undefined) {
      return undefined;
    }
    const continuation = parseConditionalTrashContinuation(remaining.rest);
    if (remaining.rest.length > 0 && continuation === undefined) {
      return undefined;
    }

    const selectionEvidence = [
      "expression:sequence",
      "instruction:revealTop",
      ...look.evidence,
      "instruction:selectFromSet",
      ...play.evidence,
      "instruction:playSelected",
    ] as const;
    const remainingEvidence = [
      "instruction:placeSetRemainder",
      ...remaining.evidence,
    ] as const;
    const evidence = [
      ...selectionEvidence,
      ...remainingEvidence,
      ...(continuation?.evidence ?? []),
    ] as const;

    return {
      effect: createLookedSetPlaySequence({
        count: look.count,
        enterRested: play.enterRested,
        filter: play.filter,
        max: play.max,
        ...(continuation === undefined ? {} : { continuation }),
      }),
      evidence,
      rest: "",
      ...(input.source === undefined
        ? {}
        : {
            presentationSpans: lookPlayPresentationSpans({
              input,
              remainingEvidence,
              selectionEvidence,
            }),
          }),
    };
  }

  const life = parseLookedSetLifeSelection({ text: look.rest });
  if (life === undefined) {
    return undefined;
  }

  const remaining = parseRestToBottomAnyOrder({ text: life.rest });
  if (remaining === undefined || remaining.rest.length > 0) {
    return undefined;
  }

  const selectionEvidence = [
    "expression:sequence",
    "instruction:revealTop",
    ...look.evidence,
    "instruction:selectFromSet",
    ...life.evidence,
    ...(life.revealTo === "bothPlayers"
      ? (["instruction:revealSelected"] as const)
      : []),
    "instruction:moveSelected",
  ] as const;
  const remainingEvidence = [
    "instruction:placeSetRemainder",
    ...remaining.evidence,
  ] as const;
  const evidence = [...selectionEvidence, ...remainingEvidence] as const;

  return {
    effect: createLookedSetLifeSequence({
      count: look.count,
      filter: life.filter,
      max: life.max,
      position: life.position,
      revealTo: life.revealTo,
      ...(life.destinationFaceUp === undefined
        ? {}
        : { destinationFaceUp: life.destinationFaceUp }),
    }),
    evidence,
    rest: "",
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: lookPlayPresentationSpans({
            input,
            remainingEvidence,
            selectionEvidence,
          }),
        }),
  };
}

function parseLookedSetLifeSelection(input: ParseInput):
  | {
      readonly destinationFaceUp?: boolean;
      readonly filter: CardFilter;
      readonly max: number;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly position: "top" | "bottom";
      readonly rest: string;
      readonly revealTo: "bothPlayers" | "chooserOnly";
    }
  | undefined {
  const verb = parseSearchSelectionVerb(input);
  if (verb === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: verb.rest });
  if (cardinality === undefined) {
    return undefined;
  }

  const filter = parseSearchCardFilter({ text: cardinality.rest });
  if (filter === undefined) {
    return undefined;
  }

  const destinationMatch =
    /^\s*(?:and add it\s+)?to the (?<position>top|bottom) of your Life cards(?<faceUp> face-up)?\.\s+(?<rest>Then,\s+.+)$/iu.exec(
      filter.rest,
    );
  const position = destinationMatch?.groups?.["position"];
  const faceUp = destinationMatch?.groups?.["faceUp"];
  const rest = destinationMatch?.groups?.["rest"];
  if ((position !== "top" && position !== "bottom") || rest === undefined) {
    return undefined;
  }

  return {
    ...(faceUp === undefined ? {} : { destinationFaceUp: true }),
    filter: filter.filter,
    max: cardinality.cardinality.max,
    evidence: [
      ...verb.evidence,
      ...cardinality.evidence,
      ...filter.evidence,
      "destination:life",
      position === "top" ? "position:top" : "position:bottom",
      ...(faceUp === undefined ? [] : (["destination:faceUp"] as const)),
    ],
    position,
    rest,
    revealTo: verb.revealTo,
  };
}

function parseLookedSetPlaySelection(input: ParseInput):
  | {
      readonly enterRested: boolean;
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

  const restedMatch = /^(?<filter>.+?)\s+rested$/iu.exec(filterText);
  const enterRested = restedMatch !== null;
  const predicateText = restedMatch?.groups?.["filter"] ?? filterText;

  const predicates = parseCardFilterPredicates({ text: predicateText });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  return {
    enterRested,
    filter: predicates.filter,
    max: Number.parseInt(maxText, 10),
    evidence: [
      "cardinality:upTo",
      ...predicates.evidence,
      ...(enterRested ? (["state:rested"] as const) : []),
    ],
    rest: `Then, ${remainingText}`,
  };
}

function createLookedSetLifeSequence({
  count,
  destinationFaceUp,
  filter,
  max,
  position,
  revealTo,
}: {
  readonly count: number;
  readonly destinationFaceUp?: boolean;
  readonly filter: CardFilter;
  readonly max: number;
  readonly position: "top" | "bottom";
  readonly revealTo: "bothPlayers" | "chooserOnly";
}): Extract<Effect, { type: "sequence" }> {
  const revealSelected =
    revealTo === "bothPlayers"
      ? [
          {
            connector: "ifPreviousSucceeded" as const,
            effect: {
              type: "revealSelected" as const,
              selection: lookedLifeSelection,
              visibility: "bothPlayers" as const,
            },
          },
        ]
      : [];

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
          saveAs: lookedLifeSelection,
        },
      },
      ...revealSelected,
      {
        connector: "ifPreviousSucceeded",
        effect: {
          type: "moveSelected",
          selection: lookedLifeSelection,
          from: lookedPlaySet,
          to: "life",
          position,
          ...(destinationFaceUp === undefined ? {} : { destinationFaceUp }),
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

function createLookedSetPlaySequence({
  count,
  continuation,
  enterRested,
  filter,
  max,
}: {
  readonly count: number;
  readonly continuation?: {
    readonly effect: Effect;
    readonly evidence: readonly PrimitiveEvidence[];
  };
  readonly enterRested: boolean;
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
          ...(enterRested ? { enterRested: true } : {}),
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
      ...(continuation === undefined
        ? []
        : [
            {
              connector: "then" as const,
              effect: continuation.effect,
            },
          ]),
    ],
  };
}

function parseConditionalTrashContinuation(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  if (text.length === 0) {
    return undefined;
  }
  const parsed = parseLeadingConditionalExpression(text, [
    parseFieldCardCountCondition,
  ]);
  if (parsed === undefined) {
    return undefined;
  }
  const then = parseTrashFromHandInstruction({ text: parsed.thenText });
  if (then === undefined || then.rest.length > 0) {
    return undefined;
  }
  return {
    effect: {
      type: "conditional",
      if: parsed.condition.condition,
      then: then.effect,
    },
    evidence: [
      "expression:conditional",
      ...parsed.condition.evidence,
      ...then.evidence,
    ],
  };
}

function lookPlayPresentationSpans({
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
