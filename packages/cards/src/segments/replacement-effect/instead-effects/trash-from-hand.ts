import { parseCardFilterPredicates } from "../../../filters/index.js";
import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseTrashFromHandInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match = /^you may trash (?<count>[1-9]\d*) (?<rest>.+)$/i.exec(
    text.trim(),
  );
  const countText = match?.groups?.["count"];
  const restText = match?.groups?.["rest"];
  if (countText === undefined || restText === undefined) {
    return undefined;
  }

  const count = Number.parseInt(countText, 10);
  const unfilteredMatch = /^cards? from your hand instead\.?$/i.exec(restText);
  if (unfilteredMatch !== null) {
    return {
      effect: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count,
      },
      evidence: [
        "instruction:trashFromHand",
        "count:positiveInteger",
        "player:self",
        "chooser:self",
      ],
    };
  }

  const filterText = /^(?<filter>.+?) from your hand instead\.?$/i.exec(
    restText,
  )?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }

  const parsedFilter = parseCardFilterPredicates({ text: filterText });
  if (parsedFilter === undefined || parsedFilter.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "trashFromHand",
      player: "self",
      chooser: "self",
      count,
      filter: parsedFilter.filter,
    },
    evidence: [
      "instruction:trashFromHand",
      "count:positiveInteger",
      "player:self",
      "chooser:self",
      ...parsedFilter.evidence,
    ],
  };
}
