import type { Condition, Effect } from "@optcg/types";

import {
  fieldEffectDurationParsers,
  parseDurationFromSet,
  type DurationParseResult,
} from "../../durations/index.js";
import type {
  ConditionParseResult,
  InstructionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../../types.js";

export interface ContinuousInstructionContext {
  readonly condition: Condition | undefined;
  readonly parseCondition?: (text: string) => ConditionParseResult | undefined;
}

export type ContinuousInstructionParser = (
  input: ParseInput,
  context: ContinuousInstructionContext,
) => InstructionParseResult | undefined;

export const continuousDuration = (
  condition: Condition | undefined,
): Extract<
  Effect,
  { type: "modifyPower" | "giveKeyword" | "setBasePower" }
>["duration"] =>
  condition === undefined
    ? { type: "whileSourceOnField" }
    : { type: "whileConditionTrue", condition };

export const continuousDurationEvidence = (
  condition: Condition | undefined,
): PrimitiveEvidence =>
  condition === undefined
    ? "duration:whileSourceOnField"
    : "duration:whileConditionTrue";

export const parseFieldEffectDuration = (
  input: ParseInput,
): DurationParseResult | undefined =>
  parseDurationFromSet(input, fieldEffectDurationParsers);
