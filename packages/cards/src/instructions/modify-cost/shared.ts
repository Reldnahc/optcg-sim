import type { Duration } from "@optcg/types";

import { parseExplicitFieldEffectDuration } from "../../durations/index.js";
import type { PrimitiveEvidence } from "../../types.js";
import type { ContinuousInstructionContext } from "../continuous-field-effects.js";

const costReductionPrefix = String.raw`(?:-|\u2212|\u00e2\u02c6\u2019)`;
const negativeCostModifierPattern = new RegExp(
  String.raw`^${costReductionPrefix}(?<value>[1-9]\d*) cost\b\s*(?<rest>.*)$`,
  "iu",
);

export const modifyCostInstructionPrimitive = {
  primitiveId: "instruction:modifyCost",
  childPrimitiveIds: [
    "filter:type",
    "filter:category:character",
    "filter:cost",
    "zone:hand",
    "modifier:costReduction",
    "duration:whileConditionTrue",
  ],
} as const;

export function parseCostModifierDuration(
  text: string,
  options: {
    readonly condition: ContinuousInstructionContext["condition"];
    readonly requireExplicitDuration: boolean;
  },
):
  | {
      readonly duration: Duration;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const explicit = parseExplicitFieldEffectDuration({ text });
  if (explicit?.duration !== undefined && explicit.rest.length === 0) {
    return { duration: explicit.duration, evidence: explicit.evidence };
  }
  const normalized = text.trim();
  if (
    options.requireExplicitDuration ||
    (normalized.length > 0 && normalized !== ".")
  ) {
    return undefined;
  }
  return {
    duration:
      options.condition === undefined
        ? { type: "whileSourceOnField" }
        : { type: "whileConditionTrue", condition: options.condition },
    evidence: [
      options.condition === undefined
        ? "duration:whileSourceOnField"
        : "duration:whileConditionTrue",
    ],
  };
}

export function parsePositiveCostModifier(input: { readonly text: string }):
  | {
      readonly value: number;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const match = /^\+(?<value>[1-9]\d*) cost\b\s*(?<rest>.*)$/i.exec(input.text);
  const valueText = match?.groups?.["value"];
  const restText = match?.groups?.["rest"];
  if (valueText === undefined) {
    return undefined;
  }

  return {
    value: Number.parseInt(valueText, 10),
    evidence: ["modifier:positiveCost", "count:positiveInteger"],
    rest: restText?.trim() ?? "",
  };
}

export function parseNegativeCostModifier(input: { readonly text: string }):
  | {
      readonly value: number;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const match = negativeCostModifierPattern.exec(input.text);
  const valueText = match?.groups?.["value"];
  const restText = match?.groups?.["rest"];
  if (valueText === undefined) {
    return undefined;
  }

  return {
    value: -Number.parseInt(valueText, 10),
    evidence: ["modifier:costReduction", "count:positiveInteger"],
    rest: restText?.trim() ?? "",
  };
}
