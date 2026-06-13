import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseTrashToDeckBottomInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may place (?<count>[1-9]\d*) cards? from your trash at the bottom of your deck in any order instead\.?$/iu.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "payCost",
            cost: {
              type: "moveCards",
              count,
              chooser: "self",
              from: { player: "self", zone: "trash" },
              to: { player: "self", zone: "deck", position: "bottom" },
              order: "chooserChoice",
              optional: true,
            },
          },
        },
      ],
    },
    evidence: [
      "composition:sequence",
      "instruction:moveCards",
      "cost:moveCards",
      "count:positiveInteger",
      "chooser:self",
      "player:self",
      "zone:trash",
      "destination:deck",
      "position:bottom",
    ],
  };
}
