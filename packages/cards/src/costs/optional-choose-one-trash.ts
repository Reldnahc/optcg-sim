import type { OptionalCost } from "@optcg/types";

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
  const fieldMatch =
    /^trash (?<count>[1-9]\d*) of your (?<type>\{[^}]+\}) type Characters$/i.exec(
      text,
    );
  const fieldCountText = fieldMatch?.groups?.["count"];
  const fieldTypeText = fieldMatch?.groups?.["type"];
  if (fieldCountText !== undefined && fieldTypeText !== undefined) {
    const typeName = /^\{(?<name>[^}]+)\}$/.exec(fieldTypeText)?.groups?.[
      "name"
    ];
    if (typeName === undefined || typeName.trim().length === 0) {
      return undefined;
    }

    return {
      cost: {
        type: "trashFromField",
        count: Number.parseInt(fieldCountText, 10),
        chooser: self,
        optional: true,
        filter: {
          categories: ["character"],
          typesAny: [typeName.trim()],
        },
      },
      evidence: [
        "cost:trashFromField",
        "count:positiveInteger",
        "chooser:self",
        "filter:type",
        "filter:category:character",
      ],
    };
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
