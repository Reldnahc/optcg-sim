import type { Zone } from "@optcg/types";

import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseRestCardsInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may rest (?<count>[1-9]\d*) of your (?<target>cards|Characters) instead\.?$/i.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  const targetText = match?.groups?.["target"];
  if (countText === undefined || targetText === undefined) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);
  const target = targetText.toLowerCase();
  const zones: Zone[] =
    target === "characters"
      ? ["characterArea"]
      : ["leaderArea", "characterArea", "stageArea", "costArea"];

  return {
    effect: {
      type: "rest",
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zones,
          min: count,
          max: count,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    evidence: [
      "instruction:rest",
      target === "characters" ? "target:yourCharacters" : "target:yourCards",
      ...(target === "characters" ? [] : (["zone:leaderArea"] as const)),
      "zone:characterArea",
      ...(target === "characters"
        ? []
        : (["zone:stageArea", "zone:costArea"] as const)),
      "cardinality:exact",
      "count:positiveInteger",
    ],
  };
}
