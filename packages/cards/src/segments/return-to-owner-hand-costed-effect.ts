import type { Effect } from "@optcg/types";

import { parseExpression } from "../expression-parser.js";
import { selectThenReturnToOwnerHand } from "../instructions/index.js";
import type {
  ConditionParser,
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
} from "../types.js";
import { conditionalExpressionSegmentParser } from "./composed-expression.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

const costReturnSelectionId = "selected:return-cost-to-owner-hand";

export function returnToOwnerHandCostedEffectExpressionParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const parsed = parseCostAndBody(input.text);
    if (parsed === undefined) {
      return undefined;
    }

    const body = parseBody(parsed.bodyText, options);
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "sequence",
        effects: [
          ...returnCostSegments(),
          {
            id: "body:after-return-cost",
            connector: "ifPreviousSucceeded",
            effect: body.effect,
          },
        ],
      },
      evidence: [
        "composition:optionalCostedEffect",
        "cost:returnToOwnerHand",
        "cardinality:exact",
        "count:positiveInteger",
        "target:yourCharacters",
        "player:self",
        "destination:ownerHand",
        "composition:selectThenApply",
        ...body.evidence,
      ],
      rest: "",
    };
  };
}

function parseCostAndBody(
  text: string,
): { readonly bodyText: string } | undefined {
  const match =
    /^You may return 1 of your Characters to the owner's hand:\s*(?<body>.+)$/iu.exec(
      text,
    );
  const bodyText = match?.groups?.["body"]?.trim();
  return bodyText === undefined || bodyText.length === 0
    ? undefined
    : { bodyText };
}

function returnCostSegments(): Extract<
  Effect,
  { type: "sequence" }
>["effects"] {
  const effect = selectThenReturnToOwnerHand("self", 0, 1, {
    categories: ["character"],
  });
  if (effect.type !== "sequence") {
    return [];
  }
  return effect.effects.map((segment, index) =>
    index === 0
      ? {
          ...segment,
          id: "select:return-cost-to-owner-hand",
          saveResultAs: costReturnSelectionId,
        }
      : {
          ...segment,
          connector: "ifPreviousSucceeded",
          effect:
            segment.effect.type === "bounce"
              ? {
                  ...segment.effect,
                  target: {
                    ...segment.effect.target,
                    binding: {
                      family: "selectedTargets",
                      saveResultAs: costReturnSelectionId,
                    },
                  },
                }
              : segment.effect,
        },
  );
}

function parseBody(
  text: string,
  options: {
    readonly conditions: readonly ConditionParser[];
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
    segments: [
      conditionalExpressionSegmentParser({
        conditions: options.conditions,
        connectors: [],
        instructions: options.instructions,
      }),
      syntheticInstructionSegmentParser(options.instructions),
    ],
  });
}
