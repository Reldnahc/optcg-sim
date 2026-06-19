import type { OptionalCost } from "@optcg/types";

import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
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
    const body = syntheticInstructionSegmentParser(options.instructions)({
      text: bodyText,
    });
    if (body === undefined) {
      return undefined;
    }

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
    };
  };
}

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
