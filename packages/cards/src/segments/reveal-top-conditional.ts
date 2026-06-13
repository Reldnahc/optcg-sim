import type { CardFilter, SelectionId, SelectionSetId } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import { parseKeyword } from "../keywords/index.js";
import { parseExpression } from "../expression-parser.js";
import { sourceSpan } from "../source-slices.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

const revealedTopSet = "set:revealed-top-conditional" as SelectionSetId;
const revealedTopSelection = "revealSelection:conditional" as SelectionId;
const revealedTopPlayedObject = "playedObject:revealed-top" as const;
type RevealTopSourceZone = "deck" | "life";

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
    const sourceZone = match?.sourceZone;
    if (
      predicateText === undefined ||
      bodyText === undefined ||
      sourceZone === undefined
    ) {
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

    const sourceEvidence: readonly PrimitiveEvidence[] =
      sourceZone === "life" ? ["zone:life"] : ["look:topDeck", "zone:deck"];
    const evidence = [
      "expression:sequence",
      "instruction:revealTop",
      ...sourceEvidence,
      "count:positiveInteger",
      "reveal:bothPlayers",
      "instruction:selectFromSet",
      ...predicates.evidence,
      "connector:ifPreviousSucceeded",
      ...body.evidence,
    ] as const;

    return {
      effect: revealSelectThenBody(predicates.filter, body.effect, sourceZone),
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
      readonly sourceZone: RevealTopSourceZone;
    }
  | undefined {
  const sourcePattern = String.raw`(?<source>deck|Life cards)`;
  const hasMatch = new RegExp(
    String.raw`^Reveal 1 card from the top of your ${sourcePattern}\. If (?:the revealed card|that card) has (?<predicate>.+), (?<body>[\s\S]+)$`,
    "iu",
  ).exec(text);
  const hasPredicate = hasMatch?.groups?.["predicate"]?.trim();
  const hasBody = hasMatch?.groups?.["body"];
  const hasSourceZone = parseRevealTopSourceZone(hasMatch?.groups?.["source"]);
  if (hasPredicate !== undefined && hasBody !== undefined) {
    if (hasSourceZone === undefined) {
      return undefined;
    }
    return {
      body: hasBody,
      predicateText: `card with ${hasPredicate}`,
      sourceZone: hasSourceZone,
    };
  }

  const typeIncludesMatch = new RegExp(
    String.raw`^Reveal 1 card from the top of your ${sourcePattern}\. If (?:the revealed card's|that card's) type includes\s+"(?<type>[^"]+)",\s*(?<body>[\s\S]+)$`,
    "iu",
  ).exec(text);
  const typeText = typeIncludesMatch?.groups?.["type"]?.trim();
  const typeBody = typeIncludesMatch?.groups?.["body"];
  const typeSourceZone = parseRevealTopSourceZone(
    typeIncludesMatch?.groups?.["source"],
  );
  if (typeText !== undefined && typeText.length > 0 && typeBody !== undefined) {
    if (typeSourceZone === undefined) {
      return undefined;
    }
    return {
      body: typeBody,
      predicateText: `card with a type including "${typeText}"`,
      sourceZone: typeSourceZone,
    };
  }

  const isMatch = new RegExp(
    String.raw`^Reveal 1 card from the top of your ${sourcePattern}\. If that card is (?<predicate>.+?), (?<body>[\s\S]+)$`,
    "iu",
  ).exec(text);
  const isPredicate = isMatch?.groups?.["predicate"]?.trim();
  const isBody = isMatch?.groups?.["body"];
  const isSourceZone = parseRevealTopSourceZone(isMatch?.groups?.["source"]);
  if (
    isPredicate === undefined ||
    isBody === undefined ||
    isSourceZone === undefined
  ) {
    return undefined;
  }
  return {
    body: isBody,
    predicateText: normalizeRevealedCardPredicate(isPredicate),
    sourceZone: isSourceZone,
  };
}

function parseRevealTopSourceZone(
  text: string | undefined,
): RevealTopSourceZone | undefined {
  if (text === undefined) {
    return undefined;
  }
  return text.toLowerCase() === "life cards" ? "life" : "deck";
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

function parseRevealPlayContinuation(
  text: string,
): ExpressionParseResult | undefined {
  if (!/^you may play that card\.?$/iu.test(text)) {
    return undefined;
  }
  return {
    effect: {
      type: "playSelected",
      selection: revealedTopSelection,
      ignoreCost: true,
    },
    evidence: ["instruction:playSelected"],
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
  const revealPlay = parseRevealPlayContinuation(text);
  if (revealPlay !== undefined) {
    return revealPlay;
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
  sourceZone: RevealTopSourceZone,
): ExpressionParseResult["effect"] {
  return {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "revealTop",
          player: "self",
          ...(sourceZone === "deck" ? {} : { zone: sourceZone }),
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
