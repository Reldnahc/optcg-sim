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

  const lifeTopToTrash = parseLifeTopToTrashCost(input);
  if (lifeTopToTrash !== undefined) {
    return lifeTopToTrash;
  }

  const actionMatch = /^place\s+(?<rest>.+)$/i.exec(input.text);
  const afterAction = actionMatch?.groups?.["rest"];
  if (afterAction === undefined) {
    return undefined;
  }

  const thisCharacterToDeckBottom =
    parseSourceCardToDeckBottomCostRoute(afterAction);
  if (thisCharacterToDeckBottom !== undefined) {
    const cost: Extract<OptionalCost, { type: "moveCards" }> = {
      type: "moveCards",
      count: 1,
      chooser: "self",
      from: {
        player: "self",
        zone: "characterArea",
        source: "effectSource",
      },
      to: { player: "self", zone: "deck", position: "bottom" },
      order: "chooserChoice",
      optional: true,
    };
    const evidence: PrimitiveEvidence[] = [
      "cost:moveCards",
      thisCharacterToDeckBottom.evidence,
      "cardinality:exact",
      "count:positiveInteger",
      "player:self",
      "zone:characterArea",
      "destination:deck",
      "position:bottom",
    ];

    return { cost, evidence, rest: "" };
  }

  const thisStageToOwnerDeckBottom =
    parseThisStageToOwnerDeckBottomCostRoute(afterAction);
  if (thisStageToOwnerDeckBottom !== undefined) {
    const cost: Extract<OptionalCost, { type: "moveCards" }> = {
      type: "moveCards",
      count: 1,
      chooser: "self",
      from: { player: "self", zone: "stageArea" },
      to: { player: "self", zone: "deck", position: "bottom" },
      order: "chooserChoice",
      filter: { categories: ["stage"] },
      optional: true,
    };
    const evidence: PrimitiveEvidence[] = [
      "cost:moveCards",
      "target:thisCard",
      "cardinality:exact",
      "count:positiveInteger",
      "player:self",
      "zone:stageArea",
      "destination:deck",
      "position:bottom",
    ];

    return { cost, evidence, rest: "" };
  }

  const cardinality = parseExactCardinality({ text: afterAction });
  if (cardinality === undefined) {
    return undefined;
  }

  const fieldToOwnerDeckBottom = parseFieldToOwnerDeckBottomCostRoute(
    cardinality.rest,
  );
  if (fieldToOwnerDeckBottom !== undefined) {
    const cost: Extract<OptionalCost, { type: "moveCards" }> = {
      type: "moveCards",
      count: cardinality.count,
      chooser: "self",
      from: { player: "self", zone: "characterArea" },
      to: { player: "self", zone: "deck", position: "bottom" },
      order: "chooserChoice",
      filter: fieldToOwnerDeckBottom.filter,
      optional: true,
    };
    const evidence: PrimitiveEvidence[] = [
      "cost:moveCards",
      ...cardinality.evidence,
      "player:self",
      "zone:characterArea",
      "destination:deck",
      "position:bottom",
      ...fieldToOwnerDeckBottom.evidence,
    ];

    return { cost, evidence, rest: "" };
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

  const handToDeck = parseHandToDeckCostRoute(cardinality.rest);
  if (handToDeck === undefined) {
    return undefined;
  }
  const cost: Extract<OptionalCost, { type: "moveCards" }> = {
    type: "moveCards",
    count: cardinality.count,
    chooser: "self",
    from: { player: "self", zone: "hand" },
    to: { player: "self", zone: "deck", position: handToDeck.position },
    order: "chooserChoice",
    optional: true,
  };
  const evidence: PrimitiveEvidence[] = [
    "cost:moveCards",
    ...cardinality.evidence,
    "player:self",
    "zone:hand",
    "destination:deck",
    handToDeck.evidence,
    "order:anyOrder",
  ];

  return { cost, evidence, rest: "" };
};

function parseHandToDeckCostRoute(text: string):
  | {
      readonly position: "top" | "bottom";
      readonly evidence: PrimitiveEvidence;
    }
  | undefined {
  const match =
    /^cards? from your hand at the (?<position>top|bottom) of your deck(?: in any order)?$/i.exec(
      text,
    );
  const position = match?.groups?.["position"];
  if (position !== "top" && position !== "bottom") {
    return undefined;
  }

  return {
    position,
    evidence: position === "top" ? "position:top" : "position:bottom",
  };
}

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

const parseLifeTopToTrashCost = (
  input: ParseInput,
): CostParseResult | undefined => {
  const match =
    /^trash (?<count>[1-9]\d*) cards? from the top of your Life cards$/i.exec(
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
      from: { player: "self", zone: "life", position: "top" },
      to: { player: "self", zone: "trash" },
      order: "chooserChoice",
      optional: true,
    },
    evidence: [
      "cost:moveCards",
      "cardinality:exact",
      "count:positiveInteger",
      "player:self",
      "zone:life",
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
    /^cards? from your trash at the bottom of your deck(?: in any order)?$/i.test(
      text,
    )
  ) {
    return { evidence: [] };
  }

  const filterBeforeCardMatch =
    /^(?<filter>.+?\s+cards?)\s+from your trash at the bottom of your deck in any order$/i.exec(
      text,
    );
  const filterBeforeCardText = filterBeforeCardMatch?.groups?.["filter"];
  if (filterBeforeCardText !== undefined) {
    const predicates = parseCardFilterPredicates({
      text: filterBeforeCardText,
    });
    if (predicates === undefined || predicates.rest.length > 0) {
      return undefined;
    }
    return { filter: predicates.filter, evidence: predicates.evidence };
  }

  const filteredMatch =
    /^cards?\s+(?<filter>.+?)\s+from your trash at the bottom of your deck in any order$/i.exec(
      text,
    );
  const filterText =
    filteredMatch?.groups?.["filter"] ??
    /^(?<filter>.+?)\s+from your trash at the bottom of your deck in any order$/iu.exec(
      text,
    )?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: filterText });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }
  return { filter: predicates.filter, evidence: predicates.evidence };
}

function parseFieldToOwnerDeckBottomCostRoute(text: string):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly filter: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["filter"];
    }
  | undefined {
  const match =
    /^of your (?<target>.+?) at the bottom of (?:the owner's|your) deck$/iu.exec(
      text,
    );
  const targetText = match?.groups?.["target"];
  if (targetText === undefined) {
    return undefined;
  }
  const predicates = parseCardFilterPredicates(
    { text: targetText },
    { powerSemantics: "current" },
  );
  if (
    predicates === undefined ||
    predicates.rest.length > 0 ||
    predicates.filter.categories?.[0] !== "character"
  ) {
    return undefined;
  }
  return { filter: predicates.filter, evidence: predicates.evidence };
}

function parseThisStageToOwnerDeckBottomCostRoute(
  text: string,
): true | undefined {
  return /^this Stage at the bottom of the owner's deck$/iu.test(text)
    ? true
    : undefined;
}

function parseSourceCardToDeckBottomCostRoute(
  text: string,
): { readonly evidence: PrimitiveEvidence } | undefined {
  const match =
    /^this (?<target>Character|card) at the bottom of (?:your|the owner's) deck$/iu.exec(
      text,
    );
  const target = match?.groups?.["target"]?.toLowerCase();
  if (target !== "character" && target !== "card") {
    return undefined;
  }
  return {
    evidence:
      target === "character" ? "target:thisCharacter" : "target:thisCard",
  };
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
