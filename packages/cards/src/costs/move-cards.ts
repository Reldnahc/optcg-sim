import type { OptionalCost } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";
import type { CostParseResult } from "./rest-don.js";

export const parseMoveCardsCost = (
  input: ParseInput,
): CostParseResult | undefined => {
  const lifeToHand = parseLifeToHandCost(input);
  if (lifeToHand !== undefined) {
    return lifeToHand;
  }

  const deckTopToTrash = parseDeckTopToTrashCost(input);
  if (deckTopToTrash !== undefined) {
    return deckTopToTrash;
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

  const trashToBottom = parseTrashToBottomDeckCostRoute(cardinality.rest);
  if (trashToBottom !== undefined) {
    const cost: Extract<OptionalCost, { type: "moveCards" }> = {
      type: "moveCards",
      count: cardinality.count,
      chooser: "self",
      from: { player: "self", zone: "trash" },
      to: { player: "self", zone: "deck", position: "bottom" },
      order: "chooserChoice",
      ...(trashToBottom.filter === undefined
        ? {}
        : { filter: trashToBottom.filter }),
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
      ...trashToBottom.evidence,
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

const parseDeckTopToTrashCost = (
  input: ParseInput,
): CostParseResult | undefined => {
  const match =
    /^trash (?<count>[1-9]\d*) cards? from the top of your deck$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }
  return {
    cost: {
      type: "moveCards",
      count: Number.parseInt(countText, 10),
      chooser: "self",
      from: { player: "self", zone: "deck", position: "top" },
      to: { player: "self", zone: "trash" },
      order: "chooserChoice",
      optional: true,
    },
    evidence: [
      "cost:moveCards",
      "cardinality:exact",
      "count:positiveInteger",
      "player:self",
      "zone:deck",
      "position:top",
      "destination:trash",
      "order:original",
    ],
    rest: "",
  };
};

function parseTrashToBottomDeckCostRoute(text: string):
  | {
      readonly filter?: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["filter"];
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  if (
    /^cards from your trash at the bottom of your deck in any order$/i.test(
      text,
    )
  ) {
    return { evidence: [] };
  }

  const filteredMatch =
    /^cards?\s+(?<filter>.+?)\s+from your trash at the bottom of your deck in any order$/i.exec(
      text,
    );
  const filterText = filteredMatch?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: filterText });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }
  return { filter: predicates.filter, evidence: predicates.evidence };
}

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
