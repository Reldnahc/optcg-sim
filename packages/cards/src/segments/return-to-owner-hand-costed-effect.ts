import type { CardFilter, Effect } from "@optcg/types";

import {
  parseOptionalCostSequence,
  type OptionalCostSequenceParseResult,
} from "../costs/index.js";
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
import { sourceSpan, trimSource, type SourceSlice } from "../source-slices.js";
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
    const parsed = parseCostAndBody(input);
    if (parsed === undefined) {
      return undefined;
    }

    const body = parseBody(parsed.bodyText, options, parsed.bodySource);
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }
    const presentationSpans = [
      ...(parsed.presentationSpans ?? []),
      ...(body.presentationSpans ?? []),
    ];

    return {
      effect: {
        type: "sequence",
        effects: [
          ...prefixCostSegments(parsed.prefixCost),
          ...returnCostSegments(parsed.filter, parsed.prefixCost !== undefined),
          {
            id: "body:after-return-cost",
            connector: "ifPreviousSucceeded",
            effect: body.effect,
          },
        ],
      },
      evidence: [
        "composition:optionalCostedEffect",
        ...(parsed.prefixCost === undefined
          ? []
          : ["composition:costSequence" as const]),
        ...(parsed.prefixCost?.evidence ?? []),
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
      ...(presentationSpans.length === 0 ? {} : { presentationSpans }),
    };
  };
}

function parseCostAndBody(input: ParseInput):
  | {
      readonly bodyText: string;
      readonly bodySource?: SourceSlice;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly filter: CharacterFilter;
      readonly presentationSpans?: ExpressionParseResult["presentationSpans"];
      readonly prefixCost?: OptionalCostSequenceParseResult;
    }
  | undefined {
  const text = input.text;
  const separatorIndex = text.indexOf(":");
  if (separatorIndex < 0) {
    return undefined;
  }

  const costText = text.slice(0, separatorIndex).trim();
  const bodyText = text.slice(separatorIndex + 1).trim();
  const costMatch =
    /^You may\s+(?:(?<prefix>.+?)\s+and\s+)?return 1 of your (?<target>.+) to the owner's hand$/iu.exec(
      costText,
    );
  const targetText = costMatch?.groups?.["target"]?.trim();
  const prefixText = costMatch?.groups?.["prefix"]?.trim();
  if (
    targetText === undefined ||
    targetText.length === 0 ||
    bodyText.length === 0
  ) {
    return undefined;
  }

  const parsedTarget = parseReturnCostTarget(targetText);
  if (parsedTarget === undefined) {
    return undefined;
  }

  const prefixCost =
    prefixText === undefined
      ? undefined
      : parseOptionalCostSequence({ text: prefixText });
  if (prefixText !== undefined && prefixCost === undefined) {
    return undefined;
  }

  const costEvidence = [
    ...(prefixCost?.evidence ?? []),
    "cost:returnToOwnerHand",
    "cardinality:exact",
    "count:positiveInteger",
    "target:yourCharacters",
    "player:self",
    ...parsedTarget.evidence,
    "destination:ownerHand",
  ] satisfies readonly PrimitiveEvidence[];
  const sourceSlices =
    input.source === undefined
      ? {}
      : {
          bodySource: trimSource({
            text: text.slice(separatorIndex + 1),
            rawText: text.slice(separatorIndex + 1),
            start: input.source.start + separatorIndex + 1,
            end: input.source.end,
          }),
          presentationSpans: [
            sourceSpan(
              "span:cost:optional",
              "cost",
              trimSource({
                text: text.slice(0, separatorIndex),
                rawText: text.slice(0, separatorIndex),
                start: input.source.start,
                end: input.source.start + separatorIndex,
              }),
              costEvidence,
            ),
          ],
        };

  return prefixCost === undefined
    ? { bodyText, ...parsedTarget, ...sourceSlices }
    : { bodyText, prefixCost, ...parsedTarget, ...sourceSlices };
}

function prefixCostSegments(
  prefixCost: OptionalCostSequenceParseResult | undefined,
): Extract<Effect, { type: "sequence" }>["effects"] {
  return prefixCost === undefined
    ? []
    : [
        {
          id: "cost:return-prefix",
          connector: "always",
          saveResultAs: "paidCost",
          effect: {
            type: "payCost",
            cost: prefixCost.cost,
          },
        },
      ];
}

function returnCostSegments(
  filter: CharacterFilter,
  hasPrefixCost: boolean,
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
          connector: hasPrefixCost ? "ifYouDo" : segment.connector,
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
      segments: [
        conditionalExpressionSegmentParser({
          conditions: options.conditions,
          connectors: [],
          instructions: options.instructions,
        }),
        syntheticInstructionSegmentParser(options.instructions),
      ],
    },
  );
}
