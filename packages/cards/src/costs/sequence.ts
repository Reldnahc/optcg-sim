import type { Cost, OptionalCost } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";
import {
  parseRestDonCost,
  type CostParseResult,
  type SequenceCostPrimitive,
} from "./rest-don.js";
import { parseTrashFromHandCost } from "./trash-from-hand.js";

const costParsers = [parseRestDonCost, parseTrashFromHandCost] as const;

export interface OptionalCostSequenceParseResult {
  readonly cost: OptionalCost;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export function parseOptionalCostSequence(
  input: ParseInput,
): OptionalCostSequenceParseResult | undefined {
  const parts = input.text
    .split(/\s+and\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length < 2) {
    return undefined;
  }

  const parsedCosts: CostParseResult[] = [];
  for (const part of parts) {
    const parsed = parseCostPart(part);
    if (parsed === undefined || parsed.rest.length > 0) {
      return undefined;
    }
    parsedCosts.push(parsed);
  }

  return {
    cost: {
      type: "sequence",
      costs: parsedCosts.map(({ cost }) => toRequiredCost(cost)),
      optional: true,
    },
    evidence: [
      "composition:costSequence",
      ...parsedCosts.flatMap((cost) => cost.evidence),
    ],
    rest: "",
  };
}

function toRequiredCost(cost: SequenceCostPrimitive): Cost {
  switch (cost.type) {
    case "restDon":
      return {
        type: "restDon",
        count: cost.count,
        ...(cost.chooser === undefined ? {} : { chooser: cost.chooser }),
      };
    case "trashFromHand":
      return {
        type: "trashFromHand",
        count: cost.count,
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      };
  }
}

function parseCostPart(text: string): CostParseResult | undefined {
  for (const parser of costParsers) {
    const parsed = parser({ text });
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}
