import type { OptionalCost } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";
import type { CostParseResult } from "./rest-don.js";

export const parseMoveCardsCost = (
  input: ParseInput,
): CostParseResult | undefined => {
  const lifeToHand = parseLifeToHandCost(input);
  if (lifeToHand !== undefined) {
    return lifeToHand;
  }

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
  if (routeMatch !== null) {
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
      "position:bottom",
      "order:anyOrder",
    ];

    return { cost, evidence, rest: "" };
  }

  const handToDeckTopMatch =
    /^card from your hand at the top of your deck$/i.exec(cardinality.rest);
  if (handToDeckTopMatch === null) {
    return undefined;
  }
  const cost: Extract<OptionalCost, { type: "moveCards" }> = {
    type: "moveCards",
    count: cardinality.count,
    chooser: "self",
    from: { player: "self", zone: "hand" },
    to: { player: "self", zone: "deck", position: "top" },
    order: "chooserChoice",
    optional: true,
  };
  const evidence: PrimitiveEvidence[] = [
    "cost:moveCards",
    ...cardinality.evidence,
    "player:self",
    "zone:hand",
    "destination:deck",
    "position:top",
    "order:anyOrder",
  ];

  return { cost, evidence, rest: "" };
};

const parseLifeToHandCost = (
  input: ParseInput,
): CostParseResult | undefined => {
  const match =
    /^add (?<count>[1-9]\d*) cards? from the (?<position>top|bottom|top or bottom) of your Life cards to your hand$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const positionText = match?.groups?.["position"];
  if (countText === undefined || positionText === undefined) {
    return undefined;
  }

  const position =
    positionText.toLowerCase() === "top or bottom"
      ? "topOrBottom"
      : (positionText.toLowerCase() as "top" | "bottom");
  const cost: Extract<OptionalCost, { type: "moveCards" }> = {
    type: "moveCards",
    count: Number.parseInt(countText, 10),
    chooser: "self",
    from: { player: "self", zone: "life", position },
    to: { player: "self", zone: "hand" },
    order: "chooserChoice",
    optional: true,
  };
  const positionEvidence: PrimitiveEvidence[] =
    position === "topOrBottom"
      ? ["position:top", "position:bottom"]
      : [position === "top" ? "position:top" : "position:bottom"];

  return {
    cost,
    evidence: [
      "cost:moveCards",
      "cardinality:exact",
      "count:positiveInteger",
      "player:self",
      "zone:life",
      ...positionEvidence,
      "destination:hand",
      "order:original",
    ],
    rest: "",
  };
};
