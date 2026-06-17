import type { DynamicNumberValue } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

const parseFieldCardFilter = (text: string) => {
  const parsed = parseCardFilterPredicates(
    { text: text.replace(/^your\s+/iu, "").trim() },
    { powerSemantics: "current" },
  );
  if (parsed === undefined || parsed.rest.trim().length > 0) {
    return undefined;
  }
  return parsed;
};

export const drawForEachFieldTrashSameExpressionParser = (
  input: ParseInput,
): ExpressionParseResult | undefined => {
  const match =
    /^Draw a card for each of (?<filter>.+?)\.\s+Then,\s+trash the same number of cards from your hand\.?$/iu.exec(
      input.text,
    );
  const filterText = match?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }
  const parsedFilter = parseFieldCardFilter(filterText);
  if (parsedFilter === undefined) {
    return undefined;
  }

  const count: DynamicNumberValue = {
    type: "countMatchingFieldCards",
    player: "self",
    zone: "characterArea",
    filter: parsedFilter.filter,
    multiplier: 1,
  };

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: { type: "draw", count, player: "self" },
        },
        {
          connector: "then",
          effect: {
            type: "trashFromHand",
            count,
            player: "self",
            chooser: "self",
          },
        },
      ],
    },
    evidence: [
      "expression:sequence",
      "instruction:draw",
      "valueSource:fieldCount",
      ...parsedFilter.evidence,
      "connector:then",
      "instruction:trashFromHand",
      "player:self",
      "chooser:self",
    ],
    rest: "",
  };
};
