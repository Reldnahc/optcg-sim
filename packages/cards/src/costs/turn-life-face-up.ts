import type { OptionalCost } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import type { ParseInput } from "../types.js";
import type { CostParseResult } from "./rest-don.js";

export const parseTurnLifeFaceUpCost = (
  input: ParseInput,
): CostParseResult | undefined => {
  const actionMatch = /^turn\s+(?<rest>.+)$/i.exec(input.text);
  const afterAction = actionMatch?.groups?.["rest"];
  if (afterAction === undefined) {
    return undefined;
  }
  const cardinality = parseExactCardinality({ text: afterAction });
  if (cardinality === undefined) {
    return undefined;
  }
  const routeMatch =
    /^card from the (?<position>top|bottom) of your Life cards face-up$/i.exec(
      cardinality.rest,
    );
  const positionText = routeMatch?.groups?.["position"];
  if (positionText === undefined) {
    return undefined;
  }
  const position = positionText.toLowerCase() as "top" | "bottom";
  const cost: Extract<OptionalCost, { type: "turnLifeFaceUp" }> = {
    type: "turnLifeFaceUp",
    count: cardinality.count,
    player: "self",
    position,
    optional: true,
  };

  return {
    cost,
    evidence: [
      "cost:turnLifeFaceUp",
      ...cardinality.evidence,
      "player:self",
      "zone:life",
      position === "top" ? "position:top" : "position:bottom",
      "reveal:bothPlayers",
    ],
    rest: "",
  };
};
