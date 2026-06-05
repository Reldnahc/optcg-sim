import { parseExpression } from "../expression-parser.js";
import type {
  ConditionParseResult,
  ConditionParser,
  ConnectorParser,
  ExpressionParseResult,
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
    const match = /^if (?<condition>.+?), (?<then>.+)$/i.exec(input.text);
    const conditionText = match?.groups?.["condition"];
    const thenText = match?.groups?.["then"];
    if (conditionText === undefined || thenText === undefined) {
      return undefined;
    }

    const condition = parseConditionExpression(
      conditionText.replace(/\.$/u, "").trim(),
      options.conditions,
    );
    if (condition !== undefined) {
      const then = parseExpression(thenText, {
        connectors: options.connectors,
        segments: [
          instructionExpressionSegmentParser({
            connectors: options.connectors,
            instructions: options.instructions,
          }),
          syntheticInstructionSegmentParser(options.instructions),
        ],
      });
      if (then === undefined || then.rest.length > 0) {
        return undefined;
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

export function trailingConditionalExpressionSegmentParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly InstructionParser[];
}): SegmentParser {
  return (input: ParseInput) => {
    const match = /^(?<then>.+?)\s+if (?<condition>.+)$/i.exec(input.text);
    const conditionText = match?.groups?.["condition"];
    const thenText = match?.groups?.["then"];
    if (conditionText === undefined || thenText === undefined) {
      return undefined;
    }

    const condition = parseConditionExpression(
      conditionText.replace(/\.$/u, "").trim(),
      options.conditions,
    );
    if (condition === undefined) {
      return undefined;
    }

    const then = parseExpression(thenText, {
      connectors: options.connectors,
      segments: [
        instructionExpressionSegmentParser({
          connectors: options.connectors,
          instructions: options.instructions,
        }),
        syntheticInstructionSegmentParser(options.instructions),
      ],
    });
    if (then === undefined || then.rest.length > 0) {
      return undefined;
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
  };
}

export function conditionalBlockExpressionParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const match = /^if (?<condition>.+?), (?<then>.+)$/i.exec(input.text);
    const conditionText = match?.groups?.["condition"];
    const thenText = match?.groups?.["then"];
    if (conditionText === undefined || thenText === undefined) {
      return undefined;
    }

    const condition = parseConditionExpression(
      conditionText,
      options.conditions,
    );
    if (condition !== undefined) {
      for (const parser of options.expressions ?? []) {
        const parsed = parser({ text: thenText });
        if (parsed !== undefined && parsed.rest.length === 0) {
          return {
            effect: parsed.effect,
            evidence: [
              "expression:conditional",
              ...condition.evidence,
              ...parsed.evidence,
            ],
            rest: "",
            blockPatch: {
              condition: condition.condition,
            },
          };
        }
      }
      const expressionSegments: SegmentParser[] = (
        options.expressions ?? []
      ).map(
        (parser): SegmentParser =>
          (segmentInput) => {
            const parsed = parser(segmentInput);
            if (parsed === undefined || parsed.rest.length > 0) {
              return undefined;
            }
            return { effect: parsed.effect, evidence: parsed.evidence };
          },
      );
      const then = parseExpression(thenText, {
        connectors: options.connectors,
        segments: [
          ...expressionSegments,
          instructionExpressionSegmentParser({
            connectors: options.connectors,
            instructions: options.instructions,
          }),
          syntheticInstructionSegmentParser(options.instructions),
        ],
      });
      if (then === undefined || then.rest.length > 0) {
        return undefined;
      }

      return {
        effect: then.effect,
        evidence: [
          "expression:conditional",
          ...condition.evidence,
          ...then.evidence,
        ],
        rest: "",
        blockPatch: {
          condition: condition.condition,
        },
      };
    }

    return undefined;
  };
}

export function conditionalCostedBlockExpressionParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const match = /^if (?<condition>.+?), (?<then>.+)$/i.exec(input.text);
    const conditionText = match?.groups?.["condition"];
    const thenText = match?.groups?.["then"];
    if (conditionText === undefined || thenText === undefined) {
      return undefined;
    }

    const condition = parseConditionExpression(
      conditionText,
      options.conditions,
    );
    if (condition !== undefined) {
      for (const expressionParser of options.expressions) {
        const then = expressionParser({ text: thenText });
        if (then === undefined || then.rest.length > 0) {
          continue;
        }

        return {
          effect: then.effect,
          evidence: [
            "expression:conditional",
            "composition:conditionalCostedEffect",
            ...condition.evidence,
            ...then.evidence,
          ],
          rest: "",
          blockPatch: {
            condition: condition.condition,
          },
        };
      }
    }

    return undefined;
  };
}

function parseConditionExpression(
  text: string,
  conditionParsers: readonly ConditionParser[],
): ConditionParseResult | undefined {
  const direct = parseSingleCondition(text, conditionParsers);
  if (direct !== undefined) {
    return direct;
  }

  const parts = text
    .split(/\s+and\s+/iu)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) {
    return undefined;
  }

  const parsedParts: ConditionParseResult[] = [];
  for (const part of parts) {
    const parsed = parseSingleCondition(part, conditionParsers);
    if (parsed === undefined) {
      return undefined;
    }
    parsedParts.push(parsed);
  }

  return {
    condition: {
      type: "and",
      conditions: parsedParts.map((part) => part.condition),
    },
    evidence: [
      "composition:conditionAnd",
      ...parsedParts.flatMap((part) => part.evidence),
    ],
    rest: "",
  };
}

function parseSingleCondition(
  text: string,
  conditionParsers: readonly ConditionParser[],
): ConditionParseResult | undefined {
  for (const conditionParser of conditionParsers) {
    const condition = conditionParser({ text });
    if (condition !== undefined && condition.rest.length === 0) {
      return condition;
    }
  }

  return undefined;
}
