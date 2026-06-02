import type { Target } from "@optcg/types";

import type { CostParseResult } from "./rest-don.js";
import { parseYourLeaderOrCharacterCardsTarget } from "../targets/index.js";
import type { ParseInput } from "../types.js";

export function parseAttachDonCost(
  input: ParseInput,
): CostParseResult | undefined {
  const match =
    /^give\s+(?<count>[1-9]\d*)\s+of your (?<state>active|rested) DON!! cards? to 1 (?<target>of your Leader or Character cards?)$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const state = match?.groups?.["state"]?.toLowerCase();
  const targetText = match?.groups?.["target"];
  if (
    countText === undefined ||
    targetText === undefined ||
    (state !== "active" && state !== "rested")
  ) {
    return undefined;
  }

  const count = Number.parseInt(countText, 10);
  const target = parseYourLeaderOrCharacterCardsTarget({ text: targetText });
  const targetData = target?.target;
  if (
    target === undefined ||
    target.rest.length > 0 ||
    targetData?.type !== "chooseFromZones"
  ) {
    return undefined;
  }

  return {
    cost: {
      type: "attachDon",
      count,
      sourceState: state,
      target: exactRequiredTarget(targetData),
      optional: true,
    },
    evidence: [
      "cost:attachDon",
      "cardinality:exact",
      "count:positiveInteger",
      `state:${state}`,
      "target:yourDonCards",
      ...target.evidence,
    ],
    rest: "",
  };
}

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
