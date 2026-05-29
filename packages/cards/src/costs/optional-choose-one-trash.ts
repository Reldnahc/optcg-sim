import type { OptionalCost } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

type ChooseOneTrashCost = Extract<OptionalCost, { type: "chooseOne" }>;
type TrashCostOptionParseResult = {
  readonly cost: ChooseOneTrashCost["options"][number];
  readonly evidence: readonly PrimitiveEvidence[];
};

export interface OptionalChooseOneTrashCostParseResult {
  readonly cost: ChooseOneTrashCost;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

const self = "self";

export function parseOptionalChooseOneTrashCost(
  input: ParseInput,
): OptionalChooseOneTrashCostParseResult | undefined {
  const prefixMatch = /^You may\s+(?<rest>.+)$/i.exec(input.text);
  const afterOptional = prefixMatch?.groups?.["rest"];
  if (afterOptional === undefined) {
    return undefined;
  }

  const split = splitCostAndBody(afterOptional);
  if (split === undefined) {
    return undefined;
  }

  const options = split.costText.split(/\s+or\s+/i);
  if (options.length < 2) {
    return undefined;
  }

  const parsedOptions: TrashCostOptionParseResult[] = [];
  for (const [index, optionText] of options.entries()) {
    const option = parseTrashCostOption(
      index === 0 ? optionText : `trash ${optionText}`,
    );
    if (option === undefined) {
      return undefined;
    }
    parsedOptions.push(option);
  }

  return {
    cost: {
      type: "chooseOne",
      optional: true,
      options: parsedOptions.map(
        (option) => option.cost,
      ) as ChooseOneTrashCost["options"],
    },
    evidence: [
      "cost:chooseOne",
      ...parsedOptions.flatMap((option) => option.evidence),
    ],
    rest: split.bodyText,
  };
}

function splitCostAndBody(
  text: string,
): { readonly costText: string; readonly bodyText: string } | undefined {
  const separatorIndex = text.indexOf(":");
  if (separatorIndex < 0) {
    return undefined;
  }

  const costText = text.slice(0, separatorIndex).trim();
  const bodyText = text.slice(separatorIndex + 1).trim();
  if (costText.length === 0 || bodyText.length === 0) {
    return undefined;
  }

  return { costText, bodyText };
}

function parseTrashCostOption(
  text: string,
): TrashCostOptionParseResult | undefined {
  const fieldOption = parseFieldTrashCostOption(text);
  if (fieldOption !== undefined) {
    return fieldOption;
  }

  const handMatch = /^trash (?<count>[1-9]\d*) cards? from your hand$/i.exec(
    text,
  );
  const handCountText = handMatch?.groups?.["count"];
  if (handCountText === undefined) {
    return undefined;
  }

  return {
    cost: {
      type: "trashFromHand",
      count: Number.parseInt(handCountText, 10),
      chooser: self,
      optional: true,
    },
    evidence: ["cost:trashFromHand", "count:positiveInteger", "chooser:self"],
  };
}

function parseFieldTrashCostOption(
  text: string,
): TrashCostOptionParseResult | undefined {
  const actionMatch = /^trash\s+(?<rest>.+)$/i.exec(text);
  const afterAction = actionMatch?.groups?.["rest"];
  if (afterAction === undefined) {
    return undefined;
  }

  const cardinality = parseExactCardinality({ text: afterAction });
  if (cardinality === undefined) {
    return undefined;
  }

  const ownershipMatch = /^of your\s+(?<predicates>.+)$/i.exec(
    cardinality.rest,
  );
  const predicateText = ownershipMatch?.groups?.["predicates"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: predicateText },
    { powerSemantics: "current" },
  );
  if (
    predicates === undefined ||
    predicates.rest.length > 0 ||
    predicates.filter.categories?.[0] !== "character" ||
    predicates.filter.typesAny?.[0] === undefined ||
    Object.keys(predicates.filter).some(
      (key) => key !== "categories" && key !== "typesAny",
    )
  ) {
    return undefined;
  }

  return {
    cost: {
      type: "trashFromField",
      count: cardinality.count,
      chooser: self,
      optional: true,
      filter: {
        categories: ["character"],
        typesAny: [predicates.filter.typesAny[0]],
      },
    },
    evidence: [
      "cost:trashFromField",
      ...cardinality.evidence,
      "chooser:self",
      ...predicates.evidence,
    ],
  };
}
