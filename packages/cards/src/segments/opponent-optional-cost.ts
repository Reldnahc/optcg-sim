import { parseExpression } from "../expression-parser.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  SegmentParser,
} from "../types.js";
import type { SourceSlice } from "../source-slices.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

export function opponentOptionalCostExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const parsed = parseOpponentReturnDonDeclineText(input);
    if (parsed === undefined) {
      return undefined;
    }

    const body = parseDeclineBody(parsed.bodyText, options, parsed.bodySource);
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "sequence",
        effects: [
          {
            id: "cost:opponent-return-don",
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "returnDon",
                count: parsed.count,
                chooser: "opponent",
                sourceState: "active",
                optional: true,
              },
            },
          },
          {
            id: "body:if-opponent-declines",
            connector: "ifPreviousNotSucceeded",
            effect: body.effect,
          },
        ],
      },
      evidence: [
        "composition:opponentOptionalCost",
        "cost:returnDon",
        "count:positiveInteger",
        "chooser:opponent",
        "state:active",
        "connector:ifPreviousNotSucceeded",
        ...body.evidence,
      ],
      rest: "",
      ...(body.presentationSpans === undefined
        ? {}
        : { presentationSpans: body.presentationSpans }),
    };
  };
}

export function opponentOptionalCostSegmentParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): SegmentParser {
  const expressionParser = opponentOptionalCostExpressionParser(options);
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

function parseOpponentReturnDonDeclineText(
  input: ParseInput,
): { count: number; bodyText: string; bodySource?: SourceSlice } | undefined {
  const match =
    /^Your opponent may return (?<count>[1-9]\d*) of their active DON!! cards? to their DON!! deck\.\s+If they do not,\s+(?<body>[\s\S]+)$/iu.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const bodyText = match?.groups?.["body"]?.trim();
  if (countText === undefined || bodyText === undefined) {
    return undefined;
  }
  const bodyStart = input.text.lastIndexOf(bodyText);
  return {
    count: Number.parseInt(countText, 10),
    bodyText,
    ...(input.source === undefined || bodyStart < 0
      ? {}
      : {
          bodySource: {
            text: bodyText,
            rawText: bodyText,
            start: input.source.start + bodyStart,
            end: input.source.end,
          },
        }),
  };
}

function parseDeclineBody(
  text: string,
  options: {
    readonly instructions: readonly InstructionParser[];
    readonly expressions?: readonly ((
      input: ParseInput,
    ) => ExpressionParseResult | undefined)[];
  },
  source?: SourceSlice,
): ExpressionParseResult | undefined {
  const input = {
    text,
    ...(source === undefined ? {} : { source }),
  };
  for (const expression of options.expressions ?? []) {
    const parsed = expression(input);
    if (parsed !== undefined && parsed.rest.length === 0) {
      return parsed;
    }
  }
  return parseExpression(input, {
    connectors: [],
    segments: [syntheticInstructionSegmentParser(options.instructions)],
  });
}
