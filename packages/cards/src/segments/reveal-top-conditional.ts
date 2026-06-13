import type { CardFilter, SelectionId, SelectionSetId } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import { parseKeyword } from "../keywords/index.js";
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
const revealedTopPlayedObject = "playedObject:revealed-top" as const;

export function revealTopConditionalExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const match = parseRevealTopCondition(input.text);
    const predicateText = match?.predicateText;
    const bodyText = match?.body.trim();
    if (predicateText === undefined || bodyText === undefined) {
      return undefined;
    }

    const predicates = parseCardFilterPredicates({ text: predicateText });
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

function parseRevealTopCondition(text: string):
  | {
      readonly body: string;
      readonly predicateText: string;
    }
  | undefined {
  const hasMatch =
    /^Reveal 1 card from the top of your deck\. If (?:the revealed card|that card) has (?<predicate>.+), (?<body>[\s\S]+)$/iu.exec(
      text,
    );
  const hasPredicate = hasMatch?.groups?.["predicate"]?.trim();
  const hasBody = hasMatch?.groups?.["body"];
  if (hasPredicate !== undefined && hasBody !== undefined) {
    return {
      body: hasBody,
      predicateText: `card with ${hasPredicate}`,
    };
  }

  const typeIncludesMatch =
    /^Reveal 1 card from the top of your deck\. If (?:the revealed card's|that card's) type includes\s+"(?<type>[^"]+)",\s*(?<body>[\s\S]+)$/iu.exec(
      text,
    );
  const typeText = typeIncludesMatch?.groups?.["type"]?.trim();
  const typeBody = typeIncludesMatch?.groups?.["body"];
  if (typeText !== undefined && typeText.length > 0 && typeBody !== undefined) {
    return {
      body: typeBody,
      predicateText: `card with a type including "${typeText}"`,
    };
  }

  const isMatch =
    /^Reveal 1 card from the top of your deck\. If that card is (?<predicate>.+?), (?<body>[\s\S]+)$/iu.exec(
      text,
    );
  const isPredicate = isMatch?.groups?.["predicate"]?.trim();
  const isBody = isMatch?.groups?.["body"];
  if (isPredicate === undefined || isBody === undefined) {
    return undefined;
  }
  return {
    body: isBody,
    predicateText: normalizeRevealedCardPredicate(isPredicate),
  };
}

function normalizeRevealedCardPredicate(predicate: string): string {
  return predicate
    .replace(/^\s*an?\s+/iu, "")
    .replace(/\bcard\b/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function parseRevealPlayKeywordContinuation(
  text: string,
): ExpressionParseResult | undefined {
  const match =
    /^you may play that card\. If you do, that Character gains (?<keyword>\[[^\]]+\]) during this turn\.?$/iu.exec(
      text,
    );
  const keywordText = match?.groups?.["keyword"];
  if (keywordText === undefined) {
    return undefined;
  }
  const keyword = parseKeyword({ text: keywordText });
  if (keyword === undefined || keyword.rest.length > 0) {
    return undefined;
  }
  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: revealedTopPlayedObject,
          effect: {
            type: "playSelected",
            selection: revealedTopSelection,
            ignoreCost: true,
          },
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            type: "giveKeyword",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "producedObjects",
                saveResultAs: revealedTopPlayedObject,
              },
              zone: "characterArea",
              player: "self",
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
            keyword: keyword.keyword,
            duration: { type: "thisTurn" },
          },
        },
      ],
    },
    evidence: [
      "expression:sequence",
      "instruction:playSelected",
      "instruction:giveKeyword",
      ...keyword.evidence,
      "duration:thisTurn",
      "composition:selectThenApply",
    ],
    rest: "",
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
  const revealPlayKeyword = parseRevealPlayKeywordContinuation(text);
  if (revealPlayKeyword !== undefined) {
    return revealPlayKeyword;
  }
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
