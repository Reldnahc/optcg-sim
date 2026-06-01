import type { CardFilter, Effect } from "@optcg/types";

import { parseExpression } from "../expression-parser.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { selectThenReturnToOwnerHand } from "../instructions/index.js";
import type {
  ConditionParser,
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { conditionalExpressionSegmentParser } from "./composed-expression.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

const costReturnSelectionId = "selected:return-cost-to-owner-hand";
type CharacterFilter = NonNullable<
  Parameters<typeof selectThenReturnToOwnerHand>[3]
>;

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
          ...returnCostSegments(parsed.filter),
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
        ...parsed.evidence,
        "destination:ownerHand",
        "composition:selectThenApply",
        ...body.evidence,
      ],
      rest: "",
    };
  };
}

function parseCostAndBody(text: string):
  | {
      readonly bodyText: string;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly filter: CharacterFilter;
    }
  | undefined {
  const match =
    /^You may return 1 of your (?<target>.+) to the owner's hand:\s*(?<body>.+)$/iu.exec(
      text,
    );
  const targetText = match?.groups?.["target"]?.trim();
  const bodyText = match?.groups?.["body"]?.trim();
  if (
    targetText === undefined ||
    targetText.length === 0 ||
    bodyText === undefined ||
    bodyText.length === 0
  ) {
    return undefined;
  }

  const parsedTarget = parseReturnCostTarget(targetText);
  return parsedTarget === undefined ? undefined : { bodyText, ...parsedTarget };
}

function returnCostSegments(
  filter: CharacterFilter,
): Extract<Effect, { type: "sequence" }>["effects"] {
  const effect = selectThenReturnToOwnerHand("self", 0, 1, filter);
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

function parseReturnCostTarget(text: string):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly filter: CharacterFilter;
    }
  | undefined {
  const parsed = parseCardFilterPredicates({ text });
  if (parsed === undefined || parsed.rest.trim().length > 0) {
    return undefined;
  }
  if (!isCharacterFilter(parsed.filter)) {
    return undefined;
  }
  return { evidence: parsed.evidence, filter: parsed.filter };
}

function isCharacterFilter(filter: CardFilter): filter is CharacterFilter {
  return filter.categories?.includes("character") === true;
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
