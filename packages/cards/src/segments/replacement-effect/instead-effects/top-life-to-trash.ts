import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseTopLifeToTrashInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may trash (?<count>[1-9]\d*) cards? from the top of your Life cards instead\.?$/i.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "moveCards",
      count: Number.parseInt(countText, 10),
      from: { player: "self", zone: "life", position: "top" },
      to: { player: "self", zone: "trash" },
      order: "original",
    },
    evidence: [
      "instruction:moveCards",
      "count:positiveInteger",
      "player:self",
      "zone:life",
      "position:top",
      "destination:trash",
      "order:original",
    ],
  };
}
