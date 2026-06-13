import type { Zone } from "@optcg/types";

import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseRestCardsInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const namedLeader = parseNamedLeaderRestInstead(text);
  if (namedLeader !== undefined) {
    return namedLeader;
  }

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

function parseNamedLeaderRestInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may rest (?<count>[1-9]\d*) of your (?<names>.+?) Leaders? instead\.?$/iu.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  const namesText = match?.groups?.["names"];
  if (countText === undefined || namesText === undefined) {
    return undefined;
  }
  const names = [...namesText.matchAll(/\[([^\]]+)\]/giu)].map(
    (nameMatch) => nameMatch[1],
  );
  if (names.length === 0 || names.some((name) => name === undefined)) {
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
          zones: ["leaderArea"],
          min: count,
          max: count,
          allowFewerIfUnavailable: false,
          visibility: "public",
          filter: {
            categories: ["leader"],
            names: names as string[],
          },
        },
      },
    },
    evidence: [
      "instruction:rest",
      "target:yourLeader",
      "zone:leaderArea",
      "filter:category:leader",
      "filter:name",
      "cardinality:exact",
      "count:positiveInteger",
    ],
  };
}
