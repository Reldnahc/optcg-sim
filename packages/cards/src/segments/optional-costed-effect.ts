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
import { sourceSpan, trimSource, type SourceSlice } from "../source-slices.js";
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
      ...(presentationSpans.length === 0 ? {} : { presentationSpans }),
    };
  };
}

type OptionalCostSequenceWithSource = OptionalCostSequenceParseResult & {
  readonly presentationSpans?: ExpressionParseResult["presentationSpans"];
  readonly restSource?: SourceSlice;
};

function parseOptionalCostSequenceFromOptionalText(
  input: ParseInput,
): OptionalCostSequenceWithSource | undefined {
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
  if (cost === undefined) {
    return undefined;
  }
  const rawBodyText = input.text.slice(separatorIndex + 1);
  const rawCostText = input.text.slice(0, separatorIndex);
  return {
    ...cost,
    rest: bodyText,
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: [
            sourceSpan(
              "span:cost:optional",
              "cost",
              trimSource({
                text: rawCostText,
                rawText: rawCostText,
                start: input.source.start,
                end: input.source.start + separatorIndex,
              }),
              cost.evidence,
            ),
          ],
          restSource: trimSource({
            text: rawBodyText,
            rawText: rawBodyText,
            start: input.source.start + separatorIndex + 1,
            end: input.source.end,
          }),
        }),
  };
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
