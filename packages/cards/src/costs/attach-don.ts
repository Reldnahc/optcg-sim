import type { Target } from "@optcg/types";

import type { CostParseResult } from "./rest-don.js";
import { parseYourLeaderOrCharacterCardsTarget } from "../targets/index.js";
import type { ParseInput } from "../types.js";

export function parseAttachDonCost(
  input: ParseInput,
): CostParseResult | undefined {
  const match =
    /^give\s+(?<count>[1-9]\d*)\s+of (?<sourceOwner>your|your opponent's) (?<state>active|rested) DON!! cards? to (?<target>.+)$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const sourceOwner = match?.groups?.["sourceOwner"]?.toLowerCase();
  const state = match?.groups?.["state"]?.toLowerCase();
  const targetText = match?.groups?.["target"];
  if (
    countText === undefined ||
    sourceOwner === undefined ||
    targetText === undefined ||
    (state !== "active" && state !== "rested")
  ) {
    return undefined;
  }

  const count = Number.parseInt(countText, 10);
  const parsedTarget = parseAttachDonCostTarget(targetText, sourceOwner);
  if (parsedTarget === undefined) {
    return undefined;
  }
  const sourcePlayer = sourceOwner === "your" ? "self" : "opponent";

  return {
    cost: {
      type: "attachDon",
      count,
      sourcePlayer,
      sourceState: state,
      target: parsedTarget.target,
      optional: true,
    },
    evidence: [
      "cost:attachDon",
      "cardinality:exact",
      "count:positiveInteger",
      `state:${state}`,
      ...(sourcePlayer === "self" ? [] : (["player:opponent"] as const)),
      sourcePlayer === "self"
        ? "target:yourDonCards"
        : "target:opponentDonCards",
      ...parsedTarget.evidence,
    ],
    rest: "",
  };
}

const parseAttachDonCostTarget = (
  targetText: string,
  sourceOwner: string,
):
  | {
      readonly evidence: CostParseResult["evidence"];
      readonly target: Target;
    }
  | undefined => {
  const targetOwner = sourceOwner === "your" ? "your" : "your opponent's";
  const characterMatch = new RegExp(
    `^1 of ${targetOwner.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} Characters?\\.?$`,
    "iu",
  ).test(targetText);
  if (characterMatch) {
    return {
      evidence: ["zone:characterArea", "filter:category:character"],
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: sourceOwner === "your" ? "self" : "opponent",
          zone: "characterArea",
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
          filter: { categories: ["character"] },
        },
      },
    };
  }
  if (sourceOwner !== "your") {
    return undefined;
  }
  const target = parseYourLeaderOrCharacterCardsTarget({
    text: targetText.replace(/^1\s+/iu, ""),
  });
  const targetData = target?.target;
  if (
    target === undefined ||
    target.rest.length > 0 ||
    targetData?.type !== "chooseFromZones"
  ) {
    return undefined;
  }
  return {
    evidence: target.evidence,
    target: exactRequiredTarget(targetData),
  };
};

function exactRequiredTarget(
  target: Extract<Target, { type: "chooseFromZones" }>,
): Extract<Target, { type: "chooseFromZones" }> {
  return {
    ...target,
    request: {
      ...target.request,
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
    },
  };
}
