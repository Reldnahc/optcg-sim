import type { ConditionParseResult, ParseInput } from "../types.js";

export function parseSourcePlayedThisTurnCondition(
  input: ParseInput,
): ConditionParseResult | undefined {
  if (!/^this Character was played on this turn\.?$/iu.test(input.text)) {
    return undefined;
  }

  return {
    condition: { type: "sourcePlayedThisTurn" },
    evidence: ["condition:sourcePlayedThisTurn"],
    rest: "",
  };
}
