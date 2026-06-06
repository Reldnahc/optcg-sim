import type { Condition, Effect } from "@optcg/types";

import {
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseThisBattleDuration,
  parseThisTurnDuration,
} from "../../durations/index.js";
import type {
  InstructionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../../types.js";

export interface ContinuousInstructionContext {
  readonly condition: Condition | undefined;
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

export const parseExplicitFieldEffectDuration = (input: ParseInput) =>
  parseOpponentNextEndPhaseDuration(input) ??
  parseOpponentNextRefreshPhaseDuration(input) ??
  parseThisTurnDuration(input) ??
  parseThisBattleDuration(input);
