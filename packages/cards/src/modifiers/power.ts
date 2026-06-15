import type { ParseInput, PrimitiveEvidence } from "../types.js";
import { negativeModifierSignPattern } from "./signs.js";

export interface PowerModifierParseResult {
  readonly value: number;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const positivePowerModifierPrimitive = {
  primitiveId: "modifier:positivePower",
  matches: [{ id: "plus-n-power" }],
} as const;

export const negativePowerModifierPrimitive = {
  primitiveId: "modifier:negativePower",
  matches: [{ id: "minus-n-power" }],
} as const;

export function parsePositivePowerModifier(
  input: ParseInput,
): PowerModifierParseResult | undefined {
  const match = /^\+(?<value>[1-9]\d*) power\b\s*(?<rest>.*)$/i.exec(
    input.text,
  );
  const valueText = match?.groups?.["value"];
  const restText = match?.groups?.["rest"];
  if (valueText === undefined) {
    return undefined;
  }

  return {
    value: Number.parseInt(valueText, 10),
    evidence: ["modifier:positivePower"],
    rest: restText?.trim() ?? "",
  };
}

const negativePowerModifierPattern = new RegExp(
  String.raw`^${negativeModifierSignPattern}(?<value>[1-9]\d*) power\b\s*(?<rest>.*)$`,
  "iu",
);

export function parseNegativePowerModifier(
  input: ParseInput,
): PowerModifierParseResult | undefined {
  const match = negativePowerModifierPattern.exec(input.text);
  const valueText = match?.groups?.["value"];
  const restText = match?.groups?.["rest"];
  if (valueText === undefined) {
    return undefined;
  }

  return {
    value: -Number.parseInt(valueText, 10),
    evidence: ["modifier:negativePower"],
    rest: restText?.trim() ?? "",
  };
}
