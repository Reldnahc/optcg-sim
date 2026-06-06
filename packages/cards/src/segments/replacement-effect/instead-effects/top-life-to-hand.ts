import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseTopLifeToHandInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may add (?<count>[1-9]\d*) cards? from the top of your Life cards to your hand instead\.?$/i.exec(
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
      to: { player: "self", zone: "hand" },
      order: "original",
    },
    evidence: [
      "instruction:moveCards",
      "count:positiveInteger",
      "player:self",
      "zone:life",
      "position:top",
      "destination:hand",
      "order:original",
    ],
  };
}
