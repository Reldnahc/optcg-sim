import type { Effect } from "@optcg/types";

import {
  optionalActivationCostParsers,
  parseCostFromSet,
} from "../costs/index.js";
import { parseExpression } from "../expression-parser.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  SegmentParser,
} from "../types.js";
import type { SourceSlice } from "../source-slices.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

export function optionalCostedEffectExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const cost = parseCostFromSet(input, optionalActivationCostParsers);
    if (cost === undefined) {
      return undefined;
    }

    const costRestSource = "restSource" in cost ? cost.restSource : undefined;
    const costPresentationSpans =
      "presentationSpans" in cost ? cost.presentationSpans : undefined;
    const body = parseOptionalCostedBody(cost.rest, options, costRestSource);
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }
    const presentationSpans = [
      ...(costPresentationSpans ?? []),
      ...(body.presentationSpans ?? []),
    ];

    return {
      effect: {
        type: "sequence",
        effects: [
          {
            id: "cost:choose-one-trash",
            connector: "always",
            saveResultAs: paidCostReferenceForBody(body.effect),
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
      ...(presentationSpans.length === 0 ? {} : { presentationSpans }),
    };
  };
}

export function optionalCostedEffectSegmentParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): SegmentParser {
  const expressionParser = optionalCostedEffectExpressionParser(options);
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

function paidCostReferenceForBody(effect: Effect): string {
  return findPaidCostReference(effect) ?? "paidCost";
}

function findPaidCostReference(effect: Effect): string | undefined {
  if (
    effect.type === "modifyPower" &&
    typeof effect.value === "object" &&
    effect.value.type === "paidCostCardCount"
  ) {
    return effect.value.cost;
  }
  if (effect.type === "sequence") {
    for (const segment of effect.effects) {
      if (segment.effect.type === "payCost") {
        continue;
      }
      const reference = findPaidCostReference(segment.effect);
      if (reference !== undefined) {
        return reference;
      }
    }
  }
  if (effect.type === "conditional") {
    return findPaidCostReference(effect.then);
  }
  return undefined;
}

function parseOptionalCostedBody(
  text: string,
  options: {
    readonly instructions: readonly InstructionParser[];
    readonly expressions?: readonly ((
      input: ParseInput,
    ) => ExpressionParseResult | undefined)[];
  },
  source?: SourceSlice,
): ExpressionParseResult | undefined {
  for (const expression of options.expressions ?? []) {
    const parsed = expression({
      text,
      ...(source === undefined ? {} : { source }),
    });
    if (parsed !== undefined && parsed.rest.length === 0) {
      return parsed;
    }
  }

  return parseExpression(
    {
      text,
      ...(source === undefined ? {} : { source }),
    },
    {
      connectors: [],
      segments: [syntheticInstructionSegmentParser(options.instructions)],
    },
  );
}
