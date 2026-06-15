import type { EffectBlockCost } from "@optcg/types";

import { parseFieldToLifePlacementParts } from "../instructions/field-to-life.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";
import type { CostParseResult as SequenceCostParseResult } from "./rest-don.js";

type MoveFieldToLifeCost = Extract<
  EffectBlockCost,
  { type: "moveFieldToLife" }
>;

export interface FieldToLifeCostParseResult {
  readonly cost: MoveFieldToLifeCost;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const parseFieldToLifeCost = (
  input: ParseInput,
): FieldToLifeCostParseResult | undefined => {
  const colonIndex = input.text.indexOf(":");
  if (colonIndex < 0) {
    return undefined;
  }

  const costText = input.text.slice(0, colonIndex).trim();
  const rest = input.text.slice(colonIndex + 1).trim();
  const parsed = parseFieldToLifeSequenceCost({ text: costText });
  if (parsed === undefined || parsed.cost.type !== "moveFieldToLife") {
    return undefined;
  }

  return {
    cost: parsed.cost,
    evidence: parsed.evidence,
    rest,
  };
};

export const parseFieldToLifeSequenceCost = (
  input: ParseInput,
): SequenceCostParseResult | undefined => {
  const parts = parseFieldToLifePlacementParts(input);
  if (parts === undefined || parts.count <= 0 || parts.min !== parts.max) {
    return undefined;
  }

  return {
    cost: {
      type: "moveFieldToLife",
      count: parts.count,
      chooser: "self",
      player: parts.player,
      filter: parts.filter,
      position: parts.position,
      ...(parts.faceUp === undefined ? {} : { faceUp: parts.faceUp }),
      optional: true,
    },
    evidence: ["cost:moveFieldToLife", ...parts.evidence],
    rest: "",
  };
};
