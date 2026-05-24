import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface DurationParseResult {
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const opponentNextRefreshPhaseDurationPrimitive = {
  primitiveId: "duration:opponentNextRefreshPhase",
  matches: [{ id: "in-opponent-next-refresh-phase" }],
} as const;

export const opponentNextEndPhaseDurationPrimitive = {
  primitiveId: "duration:opponentNextEndPhase",
  matches: [{ id: "until-end-opponent-next-end-phase" }],
} as const;

export function parseOpponentNextRefreshPhaseDuration(
  input: ParseInput,
): DurationParseResult | undefined {
  if (!/^in your opponent's next Refresh Phase\.?$/i.test(input.text)) {
    return undefined;
  }

  return {
    evidence: ["duration:opponentNextRefreshPhase"],
    rest: "",
  };
}

export function parseOpponentNextEndPhaseDuration(
  input: ParseInput,
): DurationParseResult | undefined {
  if (
    !/^until the end of your opponent's next End Phase\.?$/i.test(input.text)
  ) {
    return undefined;
  }

  return {
    evidence: ["duration:opponentNextEndPhase"],
    rest: "",
  };
}
