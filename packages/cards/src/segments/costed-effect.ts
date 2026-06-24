import {
  mandatoryActivationCostParsers,
  parseCostFromSet,
} from "../costs/index.js";
import type { EffectTextSpan } from "@optcg/types";
import { parseExpression } from "../expression-parser.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { sourceSpan, type SourceSlice } from "../source-slices.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

export function costedEffectExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const cost = parseCostFromSet(input, mandatoryActivationCostParsers);
    if (cost === undefined) {
      return undefined;
    }

    const costRestSource = "restSource" in cost ? cost.restSource : undefined;
    const costPresentationSpans =
      "presentationSpans" in cost ? cost.presentationSpans : undefined;
    const body = parseCostedBody(
      cost.rest,
      options,
      costRestSource,
      input.entryPoint,
    );
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    const evidence: readonly PrimitiveEvidence[] = [
      "composition:costedEffect",
      ...cost.evidence,
      ...body.evidence,
    ];
    const presentationSpans = [
      ...(costPresentationSpans ?? []),
      ...(body.presentationSpans ?? []),
    ];
    const resolvedPresentationSpans =
      presentationSpans.length === 0
        ? fallbackBodySpans(input, evidence)
        : presentationSpans;
    return {
      effect: {
        type: "sequence",
        effects: [
          {
            id: `cost:${cost.cost.type}`,
            connector: "always",
            effect: {
              type: "payCost",
              cost: { ...cost.cost, optional: true },
            },
          },
          {
            id: "body:after-cost",
            connector: "ifYouDo",
            effect: body.effect,
          },
        ],
      },
      evidence,
      rest: "",
      ...(body.blockPatch === undefined ? {} : { blockPatch: body.blockPatch }),
      ...(resolvedPresentationSpans.length === 0
        ? {}
        : { presentationSpans: resolvedPresentationSpans }),
    };
  };
}

function fallbackBodySpans(
  input: ParseInput,
  evidence: readonly PrimitiveEvidence[],
): readonly EffectTextSpan[] {
  return input.source === undefined
    ? []
    : [sourceSpan("span:body", "body", input.source, evidence)];
}

function parseCostedBody(
  text: string,
  options: {
    readonly instructions: readonly InstructionParser[];
    readonly expressions?: readonly ((
      input: ParseInput,
    ) => ExpressionParseResult | undefined)[];
  },
  source?: SourceSlice,
  entryPoint?: ParseInput["entryPoint"],
): ExpressionParseResult | undefined {
  for (const expression of options.expressions ?? []) {
    const parsed = expression({
      text,
      ...(source === undefined ? {} : { source }),
      ...(entryPoint === undefined ? {} : { entryPoint }),
    });
    if (parsed !== undefined && parsed.rest.length === 0) {
      return parsed;
    }
  }

  return parseExpression(
    {
      text,
      ...(source === undefined ? {} : { source }),
      ...(entryPoint === undefined ? {} : { entryPoint }),
    },
    {
      connectors: [],
      segments: [syntheticInstructionSegmentParser(options.instructions)],
    },
  );
}
