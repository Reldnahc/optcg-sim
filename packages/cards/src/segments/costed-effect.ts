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
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const cost = parseReturnDonCost(input);
    if (cost === undefined) {
      return undefined;
    }

    const body = parseExpression(cost.rest, {
      connectors: [],
      segments: [syntheticInstructionSegmentParser(options.instructions)],
    });
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    return {
      effect: body.effect,
      evidence: [
        "composition:costedEffect",
        ...cost.evidence,
        ...body.evidence,
      ],
      rest: "",
      blockPatch: {
        cost: cost.cost,
      },
    };
  };
}
