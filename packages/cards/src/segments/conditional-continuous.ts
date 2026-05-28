import { parseExpression } from "../expression-parser.js";
import type { Condition } from "@optcg/types";
import type {
  ConditionParser,
  ConnectorParser,
  ExpressionParseResult,
  ParseInput,
  SegmentParser,
} from "../types.js";
import type { ContinuousInstructionParser } from "../instructions/continuous-field-effects.js";

export function conditionalContinuousExpressionParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly ContinuousInstructionParser[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const match = /^If (?<condition>.+), (?<body>.+)$/i.exec(input.text);
    const conditionText = match?.groups?.["condition"];
    const bodyText = match?.groups?.["body"];
    if (conditionText === undefined || bodyText === undefined) {
      return undefined;
    }

    for (const conditionParser of options.conditions) {
      const condition = conditionParser({ text: conditionText });
      if (condition === undefined || condition.rest.length > 0) {
        continue;
      }

      const body = parseExpression(bodyText, {
        connectors: options.connectors,
        segments: [
          continuousInstructionSegmentParser({
            condition: condition.condition,
            instructions: options.instructions,
          }),
        ],
      });
      if (body === undefined || body.rest.length > 0) {
        continue;
      }

      return {
        effect: normalizeContinuousEffect(body.effect),
        evidence: [
          "expression:conditionalContinuous",
          ...condition.evidence,
          ...body.evidence,
        ],
        rest: "",
        blockPatch: {
          category: "permanent",
        },
      };
    }

    return undefined;
  };
}

export function entryConditionContinuousExpressionParser(options: {
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly ContinuousInstructionParser[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const condition = input.entryPoint?.condition;
    if (condition === undefined || input.entryPoint?.category !== "permanent") {
      return undefined;
    }

    const segment = continuousInstructionSegmentParser({
      condition,
      instructions: options.instructions,
    })(input);
    if (segment !== undefined) {
      return {
        effect: segment.effect,
        evidence: segment.evidence,
        rest: "",
        blockPatch: {
          category: "permanent",
        },
      };
    }

    const body = parseExpression(input.text, {
      connectors: options.connectors,
      segments: [
        continuousInstructionSegmentParser({
          condition,
          instructions: options.instructions,
        }),
      ],
    });
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    return {
      effect: normalizeContinuousEffect(body.effect),
      evidence: body.evidence,
      rest: "",
      blockPatch: {
        category: "permanent",
      },
    };
  };
}

function normalizeContinuousEffect(
  effect: ExpressionParseResult["effect"],
): ExpressionParseResult["effect"] {
  if (effect.type !== "sequence") {
    return effect;
  }

  return {
    ...effect,
    effects: effect.effects.map((segment) => ({
      ...segment,
      connector: "always",
    })),
  };
}

function continuousInstructionSegmentParser(options: {
  readonly condition: Condition;
  readonly instructions: readonly ContinuousInstructionParser[];
}): SegmentParser {
  return (input) => {
    for (const instruction of options.instructions) {
      const result = instruction(input, { condition: options.condition });
      if (result !== undefined && result.rest.length === 0) {
        return {
          effect: result.effect,
          evidence: result.evidence,
        };
      }
    }

    return undefined;
  };
}
