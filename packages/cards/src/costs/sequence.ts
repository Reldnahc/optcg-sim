import type { Cost, OptionalCost } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";
import {
  parseRestDonCost,
  type CostParseResult,
  type SequenceCostPrimitive,
} from "./rest-don.js";
import { parseRestSelfCost } from "./rest-self.js";
import { parseTrashFromHandCost } from "./trash-from-hand.js";

const costParsers = [
  parseRestSelfCost,
  parseRestDonCost,
  parseTrashFromHandCost,
] as const;

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

  if (parts.length === 0) {
    return undefined;
  }

  const parsedCosts: CostParseResult[] = [];
  let inheritedAction: "rest" | undefined;
  for (const [index, part] of parts.entries()) {
    const text = applyInheritedAction(part, inheritedAction);
    const parsed = parseCostPart(text);
    if (parsed === undefined || parsed.rest.length > 0) {
      return undefined;
    }
    if (index === 0 && /^rest\b/i.test(part)) {
      inheritedAction = "rest";
    }
    parsedCosts.push(parsed);
  }

  if (parsedCosts.length === 1) {
    const [parsedCost] = parsedCosts;
    if (parsedCost === undefined) {
      return undefined;
    }
    return {
      cost: toOptionalCost(parsedCost.cost),
      evidence: parsedCost.evidence,
      rest: "",
    };
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

function toOptionalCost(cost: SequenceCostPrimitive): OptionalCost {
  switch (cost.type) {
    case "restDon":
      return {
        type: "restDon",
        count: cost.count,
        ...(cost.chooser === undefined ? {} : { chooser: cost.chooser }),
        optional: true,
      };
    case "restSelf":
      return { type: "restSelf", optional: true };
    case "trashFromHand":
      return {
        type: "trashFromHand",
        count: cost.count,
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
        optional: true,
      };
  }
}

function toRequiredCost(cost: SequenceCostPrimitive): Cost {
  switch (cost.type) {
    case "restDon":
      return {
        type: "restDon",
        count: cost.count,
        ...(cost.chooser === undefined ? {} : { chooser: cost.chooser }),
      };
    case "restSelf":
      return { type: "restSelf" };
    case "trashFromHand":
      return {
        type: "trashFromHand",
        count: cost.count,
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      };
  }
}

function applyInheritedAction(
  text: string,
  inheritedAction: "rest" | undefined,
): string {
  if (inheritedAction === undefined || /^(?:rest|trash)\b/i.test(text)) {
    return text;
  }

  return `${inheritedAction} ${text}`;
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
