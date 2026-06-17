import type { Cost, OptionalCost } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";
import {
  parseRestDonCost,
  type CostParseResult,
  type SequenceCostPrimitive,
} from "./rest-don.js";
import { parseAttachDonCost } from "./attach-don.js";
import { parseFieldToLifeSequenceCost } from "./field-to-life.js";
import { parseTurnLifeFaceUpCost } from "./turn-life-face-up.js";
import { parseMoveCardsCost } from "./move-cards.js";
import { parseModifyPowerCost } from "./modify-power.js";
import { parseKoFromFieldCost } from "./ko-from-field.js";
import { parseRevealFromHandCost } from "./reveal-from-hand.js";
import { parseRestFromFieldCost } from "./rest-from-field.js";
import { parseRestSelfCost } from "./rest-self.js";
import { parseReturnDonSequenceCost } from "./return-don.js";
import { parseTrashFromHandCost } from "./trash-from-hand.js";
import { parseTrashFromFieldCost } from "./trash-from-field.js";
import { parseTrashSelfCost } from "./trash-self.js";

const costParsers = [
  parseReturnDonSequenceCost,
  parseRestFromFieldCost,
  parseRestSelfCost,
  parseTrashSelfCost,
  parseAttachDonCost,
  parseRestDonCost,
  parseMoveCardsCost,
  parseFieldToLifeSequenceCost,
  parseModifyPowerCost,
  parseRevealFromHandCost,
  parseTurnLifeFaceUpCost,
  parseKoFromFieldCost,
  parseTrashFromFieldCost,
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
  const parts = normalizeCompositePlaceCostBoundaries(
    normalizeAdjacentOptionalCostBoundaries(input.text),
  )
    .split(/\s*(?:,|\band\b)\s*/i)
    .map(stripOptionalCostPrefix)
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
        ...(cost.maxCount === undefined ? {} : { maxCount: cost.maxCount }),
        ...(cost.chooser === undefined ? {} : { chooser: cost.chooser }),
        optional: true,
      };
    case "restFromField":
      return {
        type: "restFromField",
        count: cost.count,
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
        optional: true,
      };
    case "attachDon":
      return { ...cost, optional: true };
    case "returnDon":
      return {
        type: "returnDon",
        count: cost.count,
        ...(cost.maxCount === undefined ? {} : { maxCount: cost.maxCount }),
        ...(cost.chooser === undefined ? {} : { chooser: cost.chooser }),
        ...(cost.sourceState === undefined
          ? {}
          : { sourceState: cost.sourceState }),
        optional: true,
      };
    case "restSelf":
      return { type: "restSelf", optional: true };
    case "trashSelf":
      return {
        type: "trashSelf",
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
        optional: true,
      };
    case "trashFromField":
      return {
        type: "trashFromField",
        count: cost.count,
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
        optional: true,
      };
    case "koFromField":
      return {
        type: "koFromField",
        count: cost.count,
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
        optional: true,
      };
    case "turnLifeFaceUp":
      return { ...cost, optional: true };
    case "setLifeFaceUp":
      return { ...cost, optional: true };
    case "trashFromHand":
      return {
        type: "trashFromHand",
        count: cost.count,
        ...(cost.maxCount === undefined ? {} : { maxCount: cost.maxCount }),
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
        optional: true,
      };
    case "revealFromHand":
      return {
        type: "revealFromHand",
        count: cost.count,
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
        optional: true,
      };
    case "moveCards":
      return { ...cost, optional: true };
    case "moveFieldToLife":
      return { ...cost, optional: true };
    case "modifyPower":
      return { ...cost, optional: true };
  }
}

function toRequiredCost(cost: SequenceCostPrimitive): Cost {
  switch (cost.type) {
    case "restDon":
      return {
        type: "restDon",
        count: cost.count,
        ...(cost.maxCount === undefined ? {} : { maxCount: cost.maxCount }),
        ...(cost.chooser === undefined ? {} : { chooser: cost.chooser }),
      };
    case "attachDon":
      return {
        type: "attachDon",
        count: cost.count,
        ...(cost.sourcePlayer === undefined
          ? {}
          : { sourcePlayer: cost.sourcePlayer }),
        sourceState: cost.sourceState,
        target: cost.target,
      };
    case "restFromField":
      return {
        type: "restFromField",
        count: cost.count,
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      };
    case "restSelf":
      return { type: "restSelf" };
    case "trashSelf":
      return {
        type: "trashSelf",
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      };
    case "trashFromField":
      return {
        type: "trashFromField",
        count: cost.count,
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      };
    case "koFromField":
      return {
        type: "koFromField",
        count: cost.count,
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      };
    case "turnLifeFaceUp":
      return {
        type: "turnLifeFaceUp",
        count: cost.count,
        player: cost.player,
        position: cost.position,
      };
    case "setLifeFaceUp":
      return {
        type: "setLifeFaceUp",
        count: cost.count,
        player: cost.player,
        position: cost.position,
        faceUp: cost.faceUp,
      };
    case "returnDon":
      return {
        type: "returnDon",
        count: cost.count,
        ...(cost.maxCount === undefined ? {} : { maxCount: cost.maxCount }),
        ...(cost.chooser === undefined ? {} : { chooser: cost.chooser }),
        ...(cost.sourceState === undefined
          ? {}
          : { sourceState: cost.sourceState }),
      };
    case "trashFromHand":
      return {
        type: "trashFromHand",
        count: cost.count,
        ...(cost.maxCount === undefined ? {} : { maxCount: cost.maxCount }),
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      };
    case "revealFromHand":
      return {
        type: "revealFromHand",
        count: cost.count,
        chooser: cost.chooser,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      };
    case "moveCards":
      return {
        type: "moveCards",
        count: cost.count,
        chooser: cost.chooser,
        from: cost.from,
        to: cost.to,
        order: cost.order,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      };
    case "moveFieldToLife":
      return {
        type: "moveFieldToLife",
        count: cost.count,
        chooser: cost.chooser,
        player: cost.player,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
        position: cost.position,
        ...(cost.faceUp === undefined ? {} : { faceUp: cost.faceUp }),
      };
    case "modifyPower":
      return {
        type: "modifyPower",
        target: cost.target,
        ...(cost.requiredState === undefined
          ? {}
          : { requiredState: cost.requiredState }),
        value: cost.value,
        duration: cost.duration,
      };
  }
}

function applyInheritedAction(
  text: string,
  inheritedAction: "rest" | undefined,
): string {
  const startsWithExplicitCostAction =
    /^(?:K\.O\.|(?:DON!!|add|give|place|rest|return|reveal|trash|turn)\b)/i.test(
      text,
    );
  if (inheritedAction === undefined || startsWithExplicitCostAction) {
    return text;
  }

  return `${inheritedAction} ${text}`;
}

function stripOptionalCostPrefix(text: string): string {
  return text.replace(/^You may\s+/i, "");
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

function normalizeAdjacentOptionalCostBoundaries(text: string): string {
  return text.replace(/\)\s+(?=You may\b)/giu, ") and ");
}

function normalizeCompositePlaceCostBoundaries(text: string): string {
  return text.replace(
    /^You may place this Character and (?<trashCost>[1-9]\d* .+? from your trash at the bottom of your deck in any order)$/iu,
    "You may place this Character at the bottom of your deck and place $<trashCost>",
  );
}
