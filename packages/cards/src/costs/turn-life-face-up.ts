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
    /^card from the (?<position>top|bottom) of your Life cards face-(?<face>up|down)$/i.exec(
      cardinality.rest,
    );
  const positionText = routeMatch?.groups?.["position"];
  const faceText = routeMatch?.groups?.["face"];
  if (positionText === undefined || faceText === undefined) {
    return undefined;
  }
  const position = positionText.toLowerCase() as "top" | "bottom";
  const faceUp = faceText.toLowerCase() === "up";
  const cost: Extract<
    OptionalCost,
    { type: "turnLifeFaceUp" | "setLifeFaceUp" }
  > = faceUp
    ? {
        type: "turnLifeFaceUp",
        count: cardinality.count,
        player: "self",
        position,
        optional: true,
      }
    : {
        type: "setLifeFaceUp",
        count: cardinality.count,
        player: "self",
        position,
        faceUp,
        optional: true,
      };

  return {
    cost,
    evidence: [
      faceUp ? "cost:turnLifeFaceUp" : "cost:setLifeFaceUp",
      ...cardinality.evidence,
      "player:self",
      "zone:life",
      position === "top" ? "position:top" : "position:bottom",
      faceUp ? "destination:faceUp" : "destination:faceDown",
      ...(faceUp ? (["reveal:bothPlayers"] as const) : []),
    ],
    rest: "",
  };
};
