import { parseReturnDonCost } from "../costs/index.js";
import { parseExpression } from "../expression-parser.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
} from "../types.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

export function costedEffectExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const cost = parseReturnDonCost(input);
    if (cost === undefined) {
      return undefined;
    }

    const body = parseCostedBody(cost.rest, options);
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "sequence",
        effects: [
          {
            id: "cost:return-don",
            connector: "always",
            effect: {
              type: "payCost",
              cost: { ...cost.cost, optional: true },
            },
          },
          {
            id: "body:after-cost",
            connector: "ifYouDo",
            effect: body.effect,
          },
        ],
      },
      evidence: [
        "composition:costedEffect",
        ...cost.evidence,
        ...body.evidence,
      ],
      rest: "",
    };
  };
}

function parseCostedBody(
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

  return parseExpression(text, {
    connectors: [],
    segments: [syntheticInstructionSegmentParser(options.instructions)],
  });
}
