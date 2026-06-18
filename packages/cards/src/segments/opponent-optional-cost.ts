import type { OptionalCost } from "@optcg/types";

import { parseExpression } from "../expression-parser.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  SegmentParser,
} from "../types.js";
import type { SourceSlice } from "../source-slices.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

type OpponentOptionalCost = Extract<
  OptionalCost,
  { type: "returnDon" | "moveCards" }
>;

export function opponentOptionalCostExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const parsed = parseOpponentOptionalCostDeclineText(input);
    if (parsed === undefined) {
      return undefined;
    }

    const body = parseDeclineBody(parsed.bodyText, options, parsed.bodySource);
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "sequence",
        effects: [
          {
            id: `cost:opponent-${parsed.cost.type}`,
            connector: "always",
            effect: {
              type: "payCost",
              cost: parsed.cost,
            },
          },
          {
            id: "body:if-opponent-declines",
            connector: "ifPreviousNotSucceeded",
            effect: body.effect,
          },
        ],
      },
      evidence: [
        "composition:opponentOptionalCost",
        ...parsed.evidence,
        "connector:ifPreviousNotSucceeded",
        ...body.evidence,
      ],
      rest: "",
      ...(body.presentationSpans === undefined
        ? {}
        : { presentationSpans: body.presentationSpans }),
    };
  };
}

export function opponentOptionalCostSegmentParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): SegmentParser {
  const expressionParser = opponentOptionalCostExpressionParser(options);
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

function parseOpponentOptionalCostDeclineText(input: ParseInput):
  | {
      cost: OpponentOptionalCost;
      evidence: readonly ExpressionParseResult["evidence"][number][];
      bodyText: string;
      bodySource?: SourceSlice;
    }
  | undefined {
  const match =
    /^Your opponent may (?<cost>[\s\S]+?)\.\s+If they do not,\s+(?<body>[\s\S]+)$/iu.exec(
      input.text,
    );
  const costText = match?.groups?.["cost"]?.trim();
  const bodyText = match?.groups?.["body"]?.trim();
  if (costText === undefined || bodyText === undefined) {
    return undefined;
  }
  const parsedCost = parseOpponentOptionalCost(costText);
  if (parsedCost === undefined) {
    return undefined;
  }
  const bodyStart = input.text.lastIndexOf(bodyText);
  return {
    ...parsedCost,
    bodyText,
    ...(input.source === undefined || bodyStart < 0
      ? {}
      : {
          bodySource: {
            text: bodyText,
            rawText: bodyText,
            start: input.source.start + bodyStart,
            end: input.source.end,
          },
        }),
  };
}

function parseOpponentOptionalCost(text: string):
  | {
      readonly cost: OpponentOptionalCost;
      readonly evidence: readonly ExpressionParseResult["evidence"][number][];
    }
  | undefined {
  const returnDon =
    /^return (?<count>[1-9]\d*) of their active DON!! cards? to their DON!! deck$/iu.exec(
      text,
    );
  const returnDonCount = returnDon?.groups?.["count"];
  if (returnDonCount !== undefined) {
    return {
      cost: {
        type: "returnDon",
        count: Number.parseInt(returnDonCount, 10),
        chooser: "opponent",
        sourceState: "active",
        optional: true,
      },
      evidence: [
        "cost:returnDon",
        "count:positiveInteger",
        "chooser:opponent",
        "state:active",
      ],
    };
  }

  const trashLife =
    /^trash (?<count>[1-9]\d*) cards? from the top of their Life cards$/iu.exec(
      text,
    );
  const trashLifeCount = trashLife?.groups?.["count"];
  if (trashLifeCount === undefined) {
    return undefined;
  }

  return {
    cost: {
      type: "moveCards",
      count: Number.parseInt(trashLifeCount, 10),
      chooser: "opponent",
      from: { player: "opponent", zone: "life", position: "top" },
      to: { player: "opponent", zone: "trash" },
      order: "chooserChoice",
      optional: true,
    },
    evidence: [
      "cost:moveCards",
      "count:positiveInteger",
      "chooser:opponent",
      "player:opponent",
      "zone:life",
      "position:top",
      "destination:trash",
      "order:original",
    ],
  };
}

function parseDeclineBody(
  text: string,
  options: {
    readonly instructions: readonly InstructionParser[];
    readonly expressions?: readonly ((
      input: ParseInput,
    ) => ExpressionParseResult | undefined)[];
  },
  source?: SourceSlice,
): ExpressionParseResult | undefined {
  const input = {
    text,
    ...(source === undefined ? {} : { source }),
  };
  for (const expression of options.expressions ?? []) {
    const parsed = expression(input);
    if (parsed !== undefined && parsed.rest.length === 0) {
      return parsed;
    }
  }
  return parseExpression(input, {
    connectors: [],
    segments: [syntheticInstructionSegmentParser(options.instructions)],
  });
}
