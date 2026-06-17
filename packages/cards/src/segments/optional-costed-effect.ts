import type { Effect } from "@optcg/types";

import {
  optionalActivationCostParsers,
  parseCostFromSet,
  type OptionalActivationCostParseResult,
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
    const paidCostReference = paidCostReferenceForCost(cost);
    const body = parseOptionalCostedBody(cost.rest, options, costRestSource);
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }
    const bodyPaidCostReference = findPaidCostReference(body.effect);
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
            saveResultAs:
              bodyPaidCostReference ?? paidCostReference ?? "paidCost",
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
      ...(body.blockPatch === undefined ? {} : { blockPatch: body.blockPatch }),
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

function paidCostReferenceForCost(
  cost: OptionalActivationCostParseResult,
): string | undefined {
  return "paidCostReference" in cost ? cost.paidCostReference : undefined;
}

function findPaidCostReference(effect: Effect): string | undefined {
  if (usesGenericPaidCostReference(effect)) {
    return "paidCost";
  }
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

function usesGenericPaidCostReference(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => usesGenericPaidCostReference(item));
  }
  if (!isRecord(value)) {
    return false;
  }
  if (value["selection"] === "paidCost") {
    return true;
  }
  const binding = value["binding"];
  if (
    isRecord(binding) &&
    binding["family"] === "paidCost" &&
    binding["saveResultAs"] === "paidCost"
  ) {
    return true;
  }
  return Object.values(value).some((item) =>
    usesGenericPaidCostReference(item),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
