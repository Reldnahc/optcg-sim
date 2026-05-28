import {
  parseOptionalChooseOneTrashCost,
  parseOptionalCostSequence,
  type OptionalCostSequenceParseResult,
} from "../costs/index.js";
import { parseExpression } from "../expression-parser.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
} from "../types.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

export function optionalCostedEffectExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const cost =
      parseOptionalCostSequenceFromOptionalText(input) ??
      parseOptionalChooseOneTrashCost(input);
    if (cost === undefined) {
      return undefined;
    }

    const body = parseOptionalCostedBody(cost.rest, options);
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "sequence",
        effects: [
          {
            id: "cost:choose-one-trash",
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: cost.cost,
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
        "composition:optionalCostedEffect",
        ...cost.evidence,
        ...body.evidence,
      ],
      rest: "",
    };
  };
}

function parseOptionalCostSequenceFromOptionalText(
  input: ParseInput,
): OptionalCostSequenceParseResult | undefined {
  const separatorIndex = input.text.indexOf(":");
  if (separatorIndex < 0) {
    return undefined;
  }

  const costText = input.text.slice(0, separatorIndex).trim();
  if (!hasOptionalCostMarker(costText)) {
    return undefined;
  }

  const bodyText = input.text.slice(separatorIndex + 1).trim();
  if (costText.length === 0 || bodyText.length === 0) {
    return undefined;
  }

  const cost = parseOptionalCostSequence({ text: costText });
  return cost === undefined ? undefined : { ...cost, rest: bodyText };
}

function hasOptionalCostMarker(text: string): boolean {
  return /^(?:[➀①➁②➂③➃④➄⑤]|You may\b|.*(?:,|\band\b)\s*You may\b)/iu.test(text);
}

function parseOptionalCostedBody(
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
