import { parseExpression } from "../expression-parser.js";
import type { Condition } from "@optcg/types";
import { parseConditionFromSet } from "../conditions/index.js";
import { sourceSpan } from "../source-slices.js";
import type {
  ConditionParseResult,
  ConditionParser,
  ConnectorParser,
  ExpressionParseResult,
  ParseInput,
  SegmentParser,
} from "../types.js";
import type { ContinuousInstructionParser } from "../instructions/continuous-field-effects.js";
import { parseLeadingConditionalExpression } from "./composed-expression.js";

export function conditionalContinuousExpressionParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly ContinuousInstructionParser[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const parsed = parseLeadingConditionalExpression(
      input.text,
      options.conditions,
    );
    if (parsed === undefined) {
      return undefined;
    }
    const { condition, thenText: bodyText } = parsed;

    const isPermanentEntry =
      input.entryPoint === undefined ||
      input.entryPoint.category === "permanent";
    const combinedCondition = combineConditions(
      input.entryPoint?.condition,
      condition.condition,
    );
    const continuousCondition = isPermanentEntry
      ? combinedCondition
      : undefined;
    const actionBlockPatch =
      combinedCondition === undefined
        ? {}
        : {
            condition: combinedCondition,
          };
    const directBody = continuousInstructionSegmentParser({
      condition: continuousCondition,
      conditions: options.conditions,
      instructions: options.instructions,
    })({ text: bodyText });
    const body =
      directBody === undefined
        ? parseExpression(bodyText, {
            connectors: options.connectors,
            segments: [
              continuousInstructionSegmentParser({
                condition: continuousCondition,
                conditions: options.conditions,
                instructions: options.instructions,
              }),
            ],
          })
        : {
            effect: directBody.effect,
            evidence: directBody.evidence,
            rest: "",
            ...(directBody.presentationSpans === undefined
              ? {}
              : { presentationSpans: directBody.presentationSpans }),
          };
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    const presentationSpans =
      body.presentationSpans ??
      (input.source === undefined
        ? undefined
        : [sourceSpan("span:body", "body", input.source, body.evidence)]);
    return {
      effect: normalizeContinuousEffect(body.effect),
      evidence: [
        "expression:conditionalContinuous",
        ...condition.evidence,
        ...(input.entryPoint?.condition === undefined
          ? []
          : (["composition:conditionAnd"] as const)),
        ...body.evidence,
      ],
      rest: "",
      ...(presentationSpans === undefined ? {} : { presentationSpans }),
      blockPatch: isPermanentEntry
        ? {
            category: "permanent",
          }
        : actionBlockPatch,
    };
  };
}

export function entryConditionContinuousExpressionParser(options: {
  readonly conditions?: readonly ConditionParser[];
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly ContinuousInstructionParser[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const condition = input.entryPoint?.condition;
    if (input.entryPoint?.category !== "permanent") {
      return undefined;
    }

    const segment = continuousInstructionSegmentParser({
      condition,
      conditions: options.conditions ?? [],
      instructions: options.instructions,
    })(input);
    if (segment !== undefined) {
      return {
        effect: segment.effect,
        evidence: segment.evidence,
        rest: "",
        ...(segment.presentationSpans === undefined
          ? {}
          : { presentationSpans: segment.presentationSpans }),
        blockPatch: {
          category: "permanent",
        },
      };
    }

    const body = parseExpression(input.text, {
      connectors: options.connectors,
      segments: [
        conditionalContinuousSegmentParser({
          condition,
          conditions: options.conditions ?? [],
          connectors: options.connectors,
          instructions: options.instructions,
        }),
        continuousInstructionSegmentParser({
          condition,
          conditions: options.conditions ?? [],
          instructions: options.instructions,
        }),
      ],
    });
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    const presentationSpans =
      body.presentationSpans ??
      (input.source === undefined
        ? undefined
        : [sourceSpan("span:body", "body", input.source, body.evidence)]);
    return {
      effect: normalizeContinuousEffect(body.effect),
      evidence: body.evidence,
      rest: "",
      ...(presentationSpans === undefined ? {} : { presentationSpans }),
      blockPatch: {
        category: "permanent",
      },
    };
  };
}

function combineConditions(
  ...conditions: readonly (Condition | undefined)[]
): Condition | undefined {
  const present = conditions.filter(
    (condition): condition is Condition => condition !== undefined,
  );
  if (present.length === 0) {
    return undefined;
  }
  if (present.length === 1) {
    return present[0];
  }
  return { type: "and", conditions: present };
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
  readonly condition: Condition | undefined;
  readonly conditions: readonly ConditionParser[];
  readonly instructions: readonly ContinuousInstructionParser[];
}): SegmentParser {
  return (input) => {
    const parseCondition = (text: string): ConditionParseResult | undefined =>
      parseConditionFromSet({ text }, options.conditions);
    for (const instruction of options.instructions) {
      const result = instruction(input, {
        condition: options.condition,
        parseCondition,
      });
      if (result !== undefined && result.rest.length === 0) {
        return {
          effect: result.effect,
          evidence: result.evidence,
          ...(input.source === undefined
            ? {}
            : {
                presentationSpans: [
                  sourceSpan(
                    "span:body",
                    "body",
                    input.source,
                    result.evidence,
                  ),
                ],
              }),
        };
      }
    }

    return undefined;
  };
}

function conditionalContinuousSegmentParser(options: {
  readonly condition: Condition | undefined;
  readonly conditions: readonly ConditionParser[];
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly ContinuousInstructionParser[];
}): SegmentParser {
  return (input) => {
    const parsed = parseLeadingConditionalExpression(
      input.text,
      options.conditions,
    );
    if (parsed === undefined) {
      return undefined;
    }

    const condition = combineConditions(
      options.condition,
      parsed.condition.condition,
    );
    const body = parseExpression(parsed.thenText, {
      connectors: options.connectors,
      segments: [
        continuousInstructionSegmentParser({
          condition,
          conditions: options.conditions,
          instructions: options.instructions,
        }),
      ],
    });
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    return {
      effect: normalizeContinuousEffect(body.effect),
      evidence: [
        "expression:conditionalContinuous",
        ...parsed.condition.evidence,
        ...(options.condition === undefined
          ? []
          : (["composition:conditionAnd"] as const)),
        ...body.evidence,
      ],
    };
  };
}
