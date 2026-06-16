import type {
  CardFilter,
  Effect,
  EffectTextPresentationRef,
  EffectTextSpan,
  OptionalCost,
} from "@optcg/types";

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
type ReturnCostTarget =
  | {
      readonly type: "selectedCharacter";
      readonly evidence: readonly PrimitiveEvidence[];
      readonly filter: CharacterFilter;
    }
  | {
      readonly type: "sourceCharacter";
      readonly evidence: readonly PrimitiveEvidence[];
    };

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
    const textKind =
      input.entryPoint?.trigger.type === "trigger" ? "trigger" : "effect";
    const costPresentation = presentationRefFromSpans(
      parsed.presentationSpans,
      textKind,
    );
    const bodyPresentation = presentationRefFromSpans(
      body.presentationSpans,
      textKind,
    );
    const presentationSpans = [
      ...(parsed.presentationSpans ?? []),
      ...(body.presentationSpans ?? []),
    ];

    return {
      effect: {
        type: "sequence",
        effects: [
          ...prefixCostSegments(parsed.prefixCost, costPresentation),
          ...returnCostSegments(
            parsed.target,
            parsed.prefixCost !== undefined,
            costPresentation,
          ),
          {
            id: "body:after-return-cost",
            connector: "ifPreviousSucceeded",
            ...(bodyPresentation === undefined
              ? {}
              : { presentation: bodyPresentation }),
            effect: effectWithPresentation(body.effect, bodyPresentation),
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
        ...parsed.target.evidence,
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
      readonly target: ReturnCostTarget;
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
    /^You may\s+(?:(?<prefix>.+?)\s+and\s+)?return (?<target>this Character|1 of your .+) to the owner's hand$/iu.exec(
      costText,
    );
  const targetText = costMatch?.groups?.["target"]
    ?.trim()
    .replace(/^1 of your\s+/iu, "");
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
    ? {
        bodyText,
        evidence: costEvidence,
        target: parsedTarget,
        ...sourceSlices,
      }
    : {
        bodyText,
        evidence: costEvidence,
        prefixCost,
        target: parsedTarget,
        ...sourceSlices,
      };
}

function prefixCostSegments(
  prefixCost: OptionalCostSequenceParseResult | undefined,
  presentation: EffectTextPresentationRef | undefined,
): Extract<Effect, { type: "sequence" }>["effects"] {
  return prefixCost === undefined
    ? []
    : [
        {
          id: "cost:return-prefix",
          connector: "always",
          saveResultAs: "paidCost",
          ...(presentation === undefined ? {} : { presentation }),
          effect: {
            type: "payCost",
            cost: prefixCost.cost,
          },
        },
      ];
}

function sourceCharacterReturnCostSegment(
  hasPrefixCost: boolean,
  presentation: EffectTextPresentationRef | undefined,
): Extract<Effect, { type: "sequence" }>["effects"] {
  const cost: Extract<OptionalCost, { type: "moveCards" }> = {
    type: "moveCards",
    count: 1,
    chooser: "self",
    from: {
      player: "self",
      zone: "characterArea",
      source: "effectSource",
    },
    to: { player: "self", zone: "hand" },
    order: "chooserChoice",
    optional: true,
  };
  return [
    {
      id: "cost:return-source-to-owner-hand",
      connector: hasPrefixCost ? "ifYouDo" : "always",
      ...(presentation === undefined ? {} : { presentation }),
      effect: { type: "payCost", cost },
    },
  ];
}

function returnCostSegments(
  target: ReturnCostTarget,
  hasPrefixCost: boolean,
  presentation: EffectTextPresentationRef | undefined,
): Extract<Effect, { type: "sequence" }>["effects"] {
  if (target.type === "sourceCharacter") {
    return sourceCharacterReturnCostSegment(hasPrefixCost, presentation);
  }

  const effect = selectThenReturnToOwnerHand("self", 0, 1, target.filter);
  if (effect.type !== "sequence") {
    return [];
  }
  return effect.effects.map((segment, index) =>
    index === 0
      ? {
          ...segment,
          id: "select:return-cost-to-owner-hand",
          connector: hasPrefixCost ? "ifYouDo" : segment.connector,
          ...(presentation === undefined ? {} : { presentation }),
          saveResultAs: costReturnSelectionId,
        }
      : {
          ...segment,
          connector: "ifPreviousSucceeded",
          ...(presentation === undefined ? {} : { presentation }),
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

const presentationRefFromSpans = (
  spans: readonly EffectTextSpan[] | undefined,
  textKind: EffectTextPresentationRef["textKind"],
): EffectTextPresentationRef | undefined => {
  const spanIds = spans
    ?.filter((span) => span.role === "body" || span.role === "cost")
    .map((span) => span.id);
  return spanIds === undefined || spanIds.length === 0
    ? undefined
    : { textKind, spanIds };
};

const sequenceSpanPrefix = (index: number): string =>
  `span:sequence:${String(index)}:`;

const presentationForSequenceIndex = (
  presentation: EffectTextPresentationRef,
  index: number,
): EffectTextPresentationRef | undefined => {
  const prefix = sequenceSpanPrefix(index);
  const spanIds = presentation.spanIds.filter((spanId) =>
    spanId.startsWith(prefix),
  );
  return spanIds.length === 0
    ? undefined
    : { textKind: presentation.textKind, spanIds };
};

const hasSequenceSpanIds = (presentation: EffectTextPresentationRef): boolean =>
  presentation.spanIds.some((spanId) => spanId.startsWith("span:sequence:"));

const effectWithPresentation = (
  effect: Effect,
  presentation: EffectTextPresentationRef | undefined,
): Effect => {
  if (presentation === undefined || effect.type !== "sequence") {
    return effect;
  }
  const usePerSegmentSpans = hasSequenceSpanIds(presentation);
  return {
    ...effect,
    effects: effect.effects.map((segment, index) => {
      const segmentPresentation = usePerSegmentSpans
        ? presentationForSequenceIndex(presentation, index)
        : presentation;
      return {
        ...segment,
        ...(segment.presentation !== undefined ||
        segmentPresentation === undefined
          ? {}
          : { presentation: segmentPresentation }),
        effect:
          segment.effect.type === "payCost"
            ? segment.effect
            : effectWithPresentation(
                segment.effect,
                segmentPresentation ?? presentation,
              ),
      };
    }),
  };
};

function parseReturnCostTarget(text: string): ReturnCostTarget | undefined {
  if (/^this Character$/iu.test(text)) {
    return {
      type: "sourceCharacter",
      evidence: [
        "cost:moveCards",
        "target:thisCharacter",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:characterArea",
      ],
    };
  }

  const parsed = parseCardFilterPredicates({ text });
  if (parsed === undefined || parsed.rest.trim().length > 0) {
    return undefined;
  }
  if (!isCharacterFilter(parsed.filter)) {
    return undefined;
  }
  return {
    type: "selectedCharacter",
    evidence: ["target:yourCharacters", "player:self", ...parsed.evidence],
    filter: parsed.filter,
  };
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
