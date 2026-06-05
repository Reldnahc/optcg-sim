import { parseCardFilterPredicates } from "../filters/index.js";
import type { CostParseResult } from "./rest-don.js";

export const parseRevealFromHandCost = (input: {
  readonly text: string;
}): CostParseResult | undefined => {
  const match =
    /^reveal (?<count>[1-9]\d*) (?<filter>.+?) from your hand$/i.exec(
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
      type: "revealFromHand",
      count: Number.parseInt(countText, 10),
      chooser: "self",
      filter: parsedFilter.filter,
      optional: true,
    },
    evidence: [
      "cost:revealFromHand",
      "count:positiveInteger",
      "chooser:self",
      ...parsedFilter.evidence,
      "reveal:bothPlayers",
    ],
    rest: "",
  };
};
