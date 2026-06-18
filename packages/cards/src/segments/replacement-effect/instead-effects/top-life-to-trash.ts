import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseTopLifeToTrashInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may trash (?<count>[1-9]\d*) cards? from the (?<position>top|bottom|top or bottom) of your Life cards instead\.?$/i.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  const positionText = match?.groups?.["position"];
  if (countText === undefined || positionText === undefined) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);
  const normalizedPosition = positionText.toLowerCase();
  const position =
    normalizedPosition === "top or bottom"
      ? "topOrBottom"
      : (normalizedPosition as "top" | "bottom");
  const positionEvidence =
    position === "topOrBottom"
      ? (["position:top", "position:bottom"] as const)
      : ([position === "top" ? "position:top" : "position:bottom"] as const);

  if (position === "topOrBottom") {
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
                from: { player: "self", zone: "life", position },
                to: { player: "self", zone: "trash" },
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
        "zone:life",
        ...positionEvidence,
        "destination:trash",
      ],
    };
  }

  return {
    effect: {
      type: "moveCards",
      count,
      from: { player: "self", zone: "life", position },
      to: { player: "self", zone: "trash" },
      order: "original",
    },
    evidence: [
      "instruction:moveCards",
      "count:positiveInteger",
      "player:self",
      "zone:life",
      ...positionEvidence,
      "destination:trash",
      "order:original",
    ],
  };
}
