import type { Effect, EffectTextSpan } from "@optcg/types";

import { parseKeyword } from "../keywords/index.js";
import { parseExpression } from "../expression-parser.js";
import { sourceSpan } from "../source-slices.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

const playedObjectReference = "playedObject:with-effect";

export function playedObjectKeywordGrantExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const match =
      /^(?<playText>[\s\S]+?)\.\s+The Character played with this effect gains (?<keyword>\[[^\]]+\]) during this turn\.?$/iu.exec(
        input.text,
      );
    const playText = match?.groups?.["playText"]?.trim();
    const keywordText = match?.groups?.["keyword"];
    if (playText === undefined || keywordText === undefined) {
      return undefined;
    }

    const play = parsePlayBody(playText, options);
    const keyword = parseKeyword({ text: keywordText });
    if (
      play === undefined ||
      play.rest.length > 0 ||
      keyword === undefined ||
      keyword.rest.length > 0
    ) {
      return undefined;
    }

    const playSequence = withSavedPlayResult(play.effect);
    if (playSequence === undefined) {
      return undefined;
    }

    const evidence: readonly PrimitiveEvidence[] = [
      "expression:sequence",
      ...play.evidence,
      "instruction:giveKeyword",
      "target:selectedCharacter",
      ...keyword.evidence,
      "duration:thisTurn",
      "composition:selectThenApply",
    ];

    return {
      effect: {
        type: "sequence",
        effects: [
          ...playSequence.effects,
          {
            id: "grant:played-object-keyword",
            connector: "ifPreviousSucceeded",
            effect: {
              type: "giveKeyword",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "producedObjects",
                  saveResultAs: playedObjectReference,
                },
                zone: "characterArea",
                player: "self",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
              keyword: keyword.keyword,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
      evidence,
      ...bodyPresentation(input, evidence),
      rest: "",
    };
  };
}

export function playedObjectDelayedDeckBottomExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const match =
      /^(?<playText>[\s\S]+?)(?:\.\s+Then,|\s+Then,)\s+place the (?<count>[1-9]\d*) Character played by this effect at the bottom of the owner's deck at the end of this turn\.?$/iu.exec(
        input.text,
      );
    const playText = match?.groups?.["playText"]?.trim();
    const countText = match?.groups?.["count"];
    if (playText === undefined || countText === undefined) {
      return undefined;
    }

    const play = parsePlayBody(playText, options);
    if (play === undefined || play.rest.length > 0) {
      return undefined;
    }

    const playSequence = withSavedPlayResult(play.effect);
    if (playSequence === undefined) {
      return undefined;
    }

    const evidence: readonly PrimitiveEvidence[] = [
      "expression:sequence",
      ...play.evidence,
      "instruction:bounce",
      "reference:thatCharacter",
      "destination:deck",
      "position:bottom",
      "duration:endOfTurn",
      "composition:delayed",
      "composition:selectThenMove",
    ];

    return {
      effect: {
        type: "sequence",
        effects: [
          ...playSequence.effects,
          {
            id: "delayed:played-object-owner-deck-bottom",
            connector: "ifPreviousSucceeded",
            effect: {
              type: "delayed",
              timing: { type: "endOfTurn", turn: "current" },
              effect: {
                type: "bounce",
                destination: "deckBottom",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "producedObjects",
                    saveResultAs: playedObjectReference,
                  },
                  zone: "characterArea",
                  player: "self",
                  visibility: "publicOnly",
                  onFailure: "failClosed",
                },
              },
            },
          },
        ],
      },
      evidence,
      ...bodyPresentation(input, evidence),
      rest: "",
    };
  };
}

function parsePlayBody(
  text: string,
  options: {
    readonly instructions: readonly InstructionParser[];
    readonly expressions?: readonly ((
      input: ParseInput,
    ) => ExpressionParseResult | undefined)[];
  },
): ExpressionParseResult | undefined {
  for (const expression of options.expressions ?? []) {
    const parsed = expression({ text });
    if (parsed !== undefined && parsed.rest.length === 0) {
      return parsed;
    }
  }
  return parseExpression(
    { text },
    {
      connectors: [],
      segments: [syntheticInstructionSegmentParser(options.instructions)],
    },
  );
}

function withSavedPlayResult(
  effect: Effect,
): Extract<Effect, { type: "sequence" }> | undefined {
  if (effect.type === "playSelected") {
    return {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: playedObjectReference,
          effect,
        },
      ],
    };
  }
  if (effect.type !== "sequence") {
    return undefined;
  }

  const effects: Extract<Effect, { type: "sequence" }>["effects"] = [];
  let foundPlaySelected = false;
  for (const segment of effect.effects) {
    if (segment.effect.type === "payCost") {
      effects.push(segment);
      continue;
    }
    const saved = withSavedPlayResult(segment.effect);
    if (saved === undefined) {
      effects.push(segment);
      continue;
    }
    foundPlaySelected = true;
    if (segment.effect.type === "playSelected") {
      effects.push({
        ...segment,
        saveResultAs: playedObjectReference,
      });
    } else {
      effects.push({
        ...segment,
        effect: saved,
      });
    }
  }
  return foundPlaySelected ? { ...effect, effects } : undefined;
}

function bodyPresentation(
  input: ParseInput,
  evidence: readonly PrimitiveEvidence[],
): { readonly presentationSpans?: readonly EffectTextSpan[] } {
  return input.source === undefined
    ? {}
    : {
        presentationSpans: [
          sourceSpan("span:body", "body", input.source, evidence),
        ],
      };
}
