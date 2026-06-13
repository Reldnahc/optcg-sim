import type { SelectionId, SelectionSetId } from "@optcg/types";

import { parseExpression } from "../expression-parser.js";
import { sourceSpan } from "../source-slices.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
} from "../types.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

const chosenCostSelection = "chosenNumber:cost" as SelectionId;
const revealedTopSet =
  "set:revealed-opponent-top-chosen-cost" as SelectionSetId;
const revealedTopSelection =
  "revealSelection:opponent-top-chosen-cost" as SelectionId;

export function chosenCostRevealExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const match =
      /^Choose a cost and reveal 1 card from the top of your opponent's deck\. If the revealed card has the chosen cost, (?<body>[\s\S]+)$/iu.exec(
        input.text,
      );
    const bodyText = match?.groups?.["body"]?.trim();
    if (bodyText === undefined || bodyText.length === 0) {
      return undefined;
    }

    const body = parseConditionalBody(bodyText, options);
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    const evidence = [
      "expression:sequence",
      "instruction:chooseNumber",
      "numberPurpose:cost",
      "instruction:revealTop",
      "look:topDeck",
      "zone:deck",
      "player:opponent",
      "count:positiveInteger",
      "reveal:bothPlayers",
      "instruction:selectFromSet",
      "filter:cost",
      "value:savedNumber",
      "connector:ifPreviousSucceeded",
      ...body.evidence,
    ] as const;

    return {
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "chooseNumber",
              chooser: "self",
              purpose: "cost",
              min: 0,
              max: 20,
              saveAs: chosenCostSelection,
            },
          },
          {
            connector: "then",
            effect: {
              type: "revealTop",
              player: "opponent",
              count: 1,
              saveAs: revealedTopSet,
              visibility: "bothPlayers",
            },
          },
          {
            connector: "then",
            effect: {
              type: "selectFromSet",
              set: revealedTopSet,
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                statComparisons: [
                  {
                    stat: "cost",
                    op: "eq",
                    value: {
                      type: "savedNumber",
                      selection: chosenCostSelection,
                    },
                  },
                ],
              },
              saveAs: revealedTopSelection,
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: body.effect,
          },
        ],
      },
      evidence,
      rest: "",
      ...(input.source === undefined
        ? {}
        : {
            presentationSpans: [
              sourceSpan("span:body", "body", input.source, evidence),
            ],
          }),
    };
  };
}

function parseConditionalBody(
  text: string,
  options: {
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
  return parseExpression(
    { text },
    {
      connectors: [],
      segments: [syntheticInstructionSegmentParser(options.instructions)],
    },
  );
}
