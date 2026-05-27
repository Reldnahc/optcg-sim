import type { OptionalCost } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";
import type { CostParseResult } from "./rest-don.js";

export const parseMoveCardsCost = (
  input: ParseInput,
): CostParseResult | undefined => {
  const actionMatch = /^place\s+(?<rest>.+)$/i.exec(input.text);
  const afterAction = actionMatch?.groups?.["rest"];
  if (afterAction === undefined) {
    return undefined;
  }

  const cardinality = parseExactCardinality({ text: afterAction });
  if (cardinality === undefined) {
    return undefined;
  }

  const routeMatch =
    /^cards from your trash at the bottom of your deck in any order$/i.exec(
      cardinality.rest,
    );
  if (routeMatch === null) {
    return undefined;
  }

  const cost: Extract<OptionalCost, { type: "moveCards" }> = {
    type: "moveCards",
    count: cardinality.count,
    chooser: "self",
    from: { player: "self", zone: "trash" },
    to: { player: "self", zone: "deck", position: "bottom" },
    order: "chooserChoice",
    optional: true,
  };
  const evidence: PrimitiveEvidence[] = [
    "cost:moveCards",
    ...cardinality.evidence,
    "player:self",
    "zone:trash",
    "destination:deck",
    "order:anyOrder",
  ];

  return { cost, evidence, rest: "" };
};
