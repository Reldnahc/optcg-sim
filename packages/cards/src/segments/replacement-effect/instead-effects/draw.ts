import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseDrawInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match = /^you may draw (?<count>[1-9]\d*) cards? instead\.?$/i.exec(
    text.trim(),
  );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "draw",
      count: Number.parseInt(countText, 10),
      player: "self",
    },
    evidence: ["instruction:draw", "count:positiveInteger"],
  };
}
