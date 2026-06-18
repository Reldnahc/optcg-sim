import type { SelectionId } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import { parseTrashFromDeckTopInstruction } from "../instructions/index.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

const trashedTopDeckSelection = "selected:trashed-top-deck" as SelectionId;

export function trashTopDeckConditionalExpressionParser(options: {
  readonly expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const parsed = parseTrashTopDeckConditional(input, options.expressions);
    if (parsed === undefined) {
      return undefined;
    }
    return parsed;
  };
}

function parseTrashTopDeckConditional(
  input: ParseInput,
  expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[],
): ExpressionParseResult | undefined {
  const match =
    /^(?<trash>Trash [1-9]\d* cards? from the top of your deck)\.\s+If the trashed card (?<predicate>has .+?),\s*(?<body>[\s\S]+)$/iu.exec(
      input.text,
    );
  const trashText = match?.groups?.["trash"];
  const predicateText = match?.groups?.["predicate"];
  const bodyText = match?.groups?.["body"]?.trim();
  if (
    trashText === undefined ||
    predicateText === undefined ||
    bodyText === undefined
  ) {
    return undefined;
  }

  const trash = parseTrashFromDeckTopInstruction({ text: trashText });
  if (trash === undefined || trash.rest.length > 0) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({
    text: normalizeTrashedCardPredicate(predicateText),
  });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  const body = parseConditionalBody(input, bodyText, expressions);
  if (body === undefined || body.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: trashedTopDeckSelection,
          saveResultKinds: ["selectedCards:deck"],
          effect: trash.effect,
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            type: "conditional",
            if: {
              type: "cardMatches",
              target: {
                type: "savedSelectedCard",
                selection: trashedTopDeckSelection,
                onFailure: "failClosed",
              },
              filter: predicates.filter,
            },
            then: body.effect,
          },
        },
      ],
    },
    evidence: [
      "expression:sequence",
      ...trash.evidence,
      "condition:cardMatches",
      ...predicates.evidence,
      "connector:ifPreviousSucceeded",
      ...body.evidence,
    ],
    rest: "",
  };
}

function parseConditionalBody(
  input: ParseInput,
  text: string,
  expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[],
): ExpressionParseResult | undefined {
  for (const expression of expressions) {
    const parsed = expression({ ...input, text });
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeTrashedCardPredicate(predicate: string): string {
  return `card with ${predicate.replace(/^has\s+/iu, "").trim()}`;
}
