import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { CostParseResult } from "./rest-don.js";

export const trashFromHandCostPrimitive: PrimitivePatternDefinition<CostParseResult> =
  {
    primitiveId: "cost:trashFromHand",
    matches: [
      {
        id: "trash-n-cards-from-your-hand",
        pattern: /^trash (?<count>[1-9]\d*) cards? from your hand$/i,
        build: (groups) => ({
          cost: {
            type: "trashFromHand",
            count: Number.parseInt(groups["count"] ?? "", 10),
            chooser: "self",
            optional: true,
          },
          evidence: [
            "cost:trashFromHand",
            "count:positiveInteger",
            "chooser:self",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseTrashFromHandCost = (
  input: Parameters<typeof parsePrimitivePattern<CostParseResult>>[0],
): CostParseResult | undefined =>
  parseFilteredTrashFromHandCost(input) ??
  parsePrimitivePattern(input, trashFromHandCostPrimitive);

const parseFilteredTrashFromHandCost = (
  input: Parameters<typeof parsePrimitivePattern<CostParseResult>>[0],
): CostParseResult | undefined => {
  const match =
    /^trash (?<count>[1-9]\d*) (?<filter>.+?) from your hand$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const filterText = match?.groups?.["filter"];
  if (countText === undefined || filterText === undefined) {
    return undefined;
  }

  const parsedFilter = [
    filterText,
    filterText.replace(/\s+cards?$/i, ""),
  ].reduce<ReturnType<typeof parseCardFilterPredicates> | undefined>(
    (parsed, candidate) =>
      parsed?.rest.length === 0
        ? parsed
        : parseCardFilterPredicates({ text: candidate }),
    undefined,
  );
  if (parsedFilter === undefined || parsedFilter.rest.length > 0) {
    return undefined;
  }

  return {
    cost: {
      type: "trashFromHand",
      count: Number.parseInt(countText, 10),
      chooser: "self",
      filter: parsedFilter.filter,
      optional: true,
    },
    evidence: [
      "cost:trashFromHand",
      "count:positiveInteger",
      "chooser:self",
      ...parsedFilter.evidence,
    ],
    rest: "",
  };
};
