import type { CardFilter, SelectionId, SelectionSetId } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import { parseExpression } from "../expression-parser.js";
import { sourceSpan } from "../source-slices.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
} from "../types.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

const revealedTopSet = "set:revealed-top-conditional" as SelectionSetId;
const revealedTopSelection = "revealSelection:conditional" as SelectionId;

export function revealTopConditionalExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const match =
      /^Reveal 1 card from the top of your deck\. If (?:the revealed card|that card) has (?<predicate>.+), (?<body>[\s\S]+)$/iu.exec(
        input.text,
      );
    const predicateText = match?.groups?.["predicate"]?.trim();
    const bodyText = match?.groups?.["body"]?.trim();
    if (predicateText === undefined || bodyText === undefined) {
      return undefined;
    }

    const predicates = parseCardFilterPredicates({
      text: `card with ${predicateText}`,
    });
    if (predicates === undefined || predicates.rest.length > 0) {
      return undefined;
    }

    const body = parseConditionalBody(bodyText, options);
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    const evidence = [
      "expression:sequence",
      "instruction:revealTop",
      "look:topDeck",
      "zone:deck",
      "count:positiveInteger",
      "reveal:bothPlayers",
      "instruction:selectFromSet",
      ...predicates.evidence,
      "connector:ifPreviousSucceeded",
      ...body.evidence,
    ] as const;

    return {
      effect: revealSelectThenBody(predicates.filter, body.effect),
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

function revealSelectThenBody(
  filter: CardFilter,
  body: ExpressionParseResult["effect"],
): ExpressionParseResult["effect"] {
  return {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "revealTop",
          player: "self",
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
          filter,
          saveAs: revealedTopSelection,
        },
      },
      {
        connector: "ifPreviousSucceeded",
        effect: body,
      },
    ],
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
