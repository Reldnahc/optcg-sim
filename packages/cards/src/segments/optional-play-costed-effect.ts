import type { EffectTextSpan } from "@optcg/types";

import { parseExpression } from "../expression-parser.js";
import { parsePlayFromHandInstruction } from "../instructions/index.js";
import { sourceSpan } from "../source-slices.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  PrimitiveEvidence,
  SegmentParser,
} from "../types.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

export function optionalPlayCostedEffectExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const split = splitOptionalPlayCost(input.text);
    if (split === undefined) {
      return undefined;
    }

    const play = parsePlayFromHandInstruction({
      text: `${capitalizeFirst(split.playText)}.`,
    });
    if (play === undefined || play.rest.length > 0) {
      return undefined;
    }

    const body = parseOptionalPlayCostedBody(split.bodyText, options);
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    const evidence: readonly PrimitiveEvidence[] = [
      "composition:optionalCostedEffect",
      ...play.evidence,
      ...body.evidence,
    ];
    const presentationSpans =
      body.presentationSpans ?? fallbackBodySpans(input, evidence);

    return {
      effect: {
        type: "sequence",
        effects: [
          {
            id: "cost:play-from-hand",
            connector: "always",
            optional: true,
            effect: play.effect,
          },
          {
            id: "body:after-play-cost",
            connector: "ifYouDo",
            effect: body.effect,
          },
        ],
      },
      evidence,
      rest: "",
      ...(body.blockPatch === undefined ? {} : { blockPatch: body.blockPatch }),
      ...(presentationSpans.length === 0 ? {} : { presentationSpans }),
    };
  };
}

export function optionalPlayCostedEffectSegmentParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): SegmentParser {
  const expressionParser = optionalPlayCostedEffectExpressionParser(options);
  return (input) => {
    const parsed = expressionParser(input);
    if (parsed === undefined || parsed.rest.length > 0) {
      return undefined;
    }

    return {
      effect: parsed.effect,
      evidence: parsed.evidence,
      ...(parsed.presentationSpans === undefined
        ? {}
        : { presentationSpans: parsed.presentationSpans }),
    };
  };
}

function splitOptionalPlayCost(
  text: string,
): { readonly playText: string; readonly bodyText: string } | undefined {
  const separatorIndex = text.indexOf(":");
  if (separatorIndex < 0) {
    return undefined;
  }

  const costText = text.slice(0, separatorIndex).trim();
  const bodyText = text.slice(separatorIndex + 1).trim();
  if (bodyText.length === 0) {
    return undefined;
  }

  const match =
    /^You may (?<playText>play\s+.+?\s+from your hand(?:\s+rested)?)$/iu.exec(
      costText,
    );
  const playText = match?.groups?.["playText"]?.trim();
  if (playText === undefined) {
    return undefined;
  }

  return { playText, bodyText };
}

function capitalizeFirst(text: string): string {
  const first = text[0];
  if (first === undefined) {
    return text;
  }
  return `${first.toUpperCase()}${text.slice(1)}`;
}

function fallbackBodySpans(
  input: ParseInput,
  evidence: readonly PrimitiveEvidence[],
): readonly EffectTextSpan[] {
  return input.source === undefined
    ? []
    : [sourceSpan("span:body", "body", input.source, evidence)];
}

function parseOptionalPlayCostedBody(
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
