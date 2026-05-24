import { parseExpression } from "../expression-parser.js";
import type {
  ConditionParser,
  ConnectorParser,
  InstructionParser,
  ParseInput,
  SegmentParser,
} from "../types.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

export function instructionExpressionSegmentParser(options: {
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly InstructionParser[];
}): SegmentParser {
  return (input: ParseInput) => {
    const result = parseExpression(input.text, {
      connectors: options.connectors,
      segments: [syntheticInstructionSegmentParser(options.instructions)],
    });

    if (result === undefined || result.rest.length > 0) {
      return undefined;
    }

    return {
      effect: result.effect,
      evidence: result.evidence,
    };
  };
}

export function conditionalExpressionSegmentParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly InstructionParser[];
}): SegmentParser {
  return (input: ParseInput) => {
    const match = /^if (?<condition>.+), (?<then>.+)$/i.exec(input.text);
    const conditionText = match?.groups?.["condition"];
    const thenText = match?.groups?.["then"];
    if (conditionText === undefined || thenText === undefined) {
      return undefined;
    }

    for (const conditionParser of options.conditions) {
      const condition = conditionParser({ text: conditionText });
      if (condition === undefined || condition.rest.length > 0) {
        continue;
      }

      const then = parseExpression(thenText, {
        connectors: options.connectors,
        segments: [syntheticInstructionSegmentParser(options.instructions)],
      });
      if (then === undefined || then.rest.length > 0) {
        continue;
      }

      return {
        effect: {
          type: "conditional",
          if: condition.condition,
          then: then.effect,
        },
        evidence: [
          "expression:conditional",
          ...condition.evidence,
          ...then.evidence,
        ],
      };
    }

    return undefined;
  };
}
