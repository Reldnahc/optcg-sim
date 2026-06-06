import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseRestCardsInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may rest (?<count>[1-9]\d*) of your cards instead\.?$/i.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);

  return {
    effect: {
      type: "rest",
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
          min: count,
          max: count,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    evidence: [
      "instruction:rest",
      "target:yourCards",
      "zone:leaderArea",
      "zone:characterArea",
      "zone:stageArea",
      "zone:costArea",
      "cardinality:exact",
      "count:positiveInteger",
    ],
  };
}
