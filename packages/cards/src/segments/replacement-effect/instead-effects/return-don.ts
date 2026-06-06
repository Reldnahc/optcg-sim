import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseReturnDonInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may return (?<count>[1-9]\d*) DON!! cards? from your field to your DON!! deck instead\.?$/i.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "returnDon",
      count: Number.parseInt(countText, 10),
      player: "self",
    },
    evidence: [
      "instruction:returnDon",
      "count:positiveInteger",
      "player:self",
      "zone:donDeck",
    ],
  };
}
