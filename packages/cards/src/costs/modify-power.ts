import type { ParseInput } from "../types.js";
import {
  parseNegativePowerModifier,
  parsePositivePowerModifier,
} from "../modifiers/index.js";
import { parseThisTurnDuration } from "../durations/index.js";
import type { CostParseResult } from "./rest-don.js";

export const parseModifyPowerCost = (
  input: ParseInput,
): CostParseResult | undefined => {
  const actionMatch =
    /^give\s+your\s+(?<state>active\s+|rested\s+)?Leader\s+(?<rest>.+)$/iu.exec(
      input.text.trim(),
    );
  const rest = actionMatch?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }

  const modifier =
    parseNegativePowerModifier({ text: rest }) ??
    parsePositivePowerModifier({ text: rest });
  if (modifier === undefined) {
    return undefined;
  }

  const duration = parseThisTurnDuration({ text: modifier.rest });
  if (duration?.duration === undefined) {
    return undefined;
  }

  const rawRequiredState = actionMatch?.groups?.["state"]?.trim().toLowerCase();
  if (
    rawRequiredState !== undefined &&
    rawRequiredState !== "active" &&
    rawRequiredState !== "rested"
  ) {
    return undefined;
  }
  const requiredState: "active" | "rested" | undefined = rawRequiredState;

  return {
    cost: {
      type: "modifyPower",
      target: { type: "myLeader" },
      ...(requiredState === undefined ? {} : { requiredState }),
      value: modifier.value,
      duration: duration.duration,
      optional: true,
    },
    evidence: [
      "cost:modifyPower",
      "target:yourLeader",
      ...(requiredState === undefined
        ? []
        : ([`state:${requiredState}`] as const)),
      ...modifier.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};
