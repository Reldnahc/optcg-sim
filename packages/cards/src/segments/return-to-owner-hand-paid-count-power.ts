import type { OptionalCost } from "@optcg/types";

import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { sourceSpan, trimSource, type SourceSlice } from "../source-slices.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

const paidReturnReference = "paidCost:returnToOwnerHand";

export function returnToOwnerHandPaidCountPowerExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const match =
      /^(?<cost>You may return any number of Characters on your field to the owner's hand)\.\s+(?<body>[\s\S]+)$/iu.exec(
        input.text,
      );
    const costText = match?.groups?.["cost"];
    const bodyText = match?.groups?.["body"];
    if (costText === undefined || bodyText === undefined) {
      return undefined;
    }

    const cost = parseAnyNumberCharactersToOwnerHandCost(costText);
    if (cost === undefined) {
      return undefined;
    }
    const costSource = sourceSliceForText(input, costText);
    const bodySource = sourceSliceForText(input, bodyText);
    const body = syntheticInstructionSegmentParser(options.instructions)({
      text: bodyText,
      ...(bodySource === undefined ? {} : { source: bodySource }),
    });
    if (body === undefined) {
      return undefined;
    }
    const presentationSpans = [
      ...(costSource === undefined
        ? []
        : [
            sourceSpan("span:cost:optional", "cost", costSource, cost.evidence),
          ]),
      ...(body.presentationSpans ?? []),
    ];

    return {
      effect: {
        type: "sequence",
        effects: [
          {
            id: "cost:return-to-owner-hand",
            connector: "always",
            saveResultAs: paidReturnReference,
            effect: {
              type: "payCost",
              cost: cost.cost,
            },
          },
          {
            id: "body:after-return-to-owner-hand",
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

const sourceSliceForText = (
  input: ParseInput,
  text: string,
): SourceSlice | undefined => {
  if (input.source === undefined) {
    return undefined;
  }
  const start = input.text.indexOf(text);
  if (start < 0) {
    return undefined;
  }
  return trimSource({
    text,
    rawText: text,
    start: input.source.start + start,
    end: input.source.start + start + text.length,
  });
};

const parseAnyNumberCharactersToOwnerHandCost = (
  text: string,
):
  | {
      readonly cost: Extract<OptionalCost, { type: "moveCards" }>;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  if (
    !/^You may return any number of Characters on your field to the owner's hand$/iu.test(
      text,
    )
  ) {
    return undefined;
  }

  return {
    cost: {
      type: "moveCards",
      count: 0,
      maxCount: "available",
      chooser: "self",
      from: { player: "self", zone: "characterArea" },
      to: { player: "self", zone: "hand" },
      order: "chooserChoice",
      filter: { categories: ["character"] },
      optional: true,
    },
    evidence: [
      "cost:returnToOwnerHand",
      "cost:moveCards",
      "count:anyNumber",
      "chooser:self",
      "filter:category:character",
      "destination:ownerHand",
    ],
  };
};
