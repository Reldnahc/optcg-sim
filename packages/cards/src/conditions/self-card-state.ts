import type { ConditionParseResult, ConditionParser } from "../types.js";

export const parseSelfCardStateCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const match = /^this Character is (?<state>active|rested)$/iu.exec(
    input.text,
  );
  const state = match?.groups?.["state"]?.toLowerCase();
  if (state !== "active" && state !== "rested") {
    return undefined;
  }

  return {
    condition: {
      type: "cardState",
      target: { type: "self" },
      state,
    },
    evidence: [
      "condition:cardState",
      "target:thisCharacter",
      state === "active" ? "state:active" : "state:rested",
    ],
    rest: "",
  };
};
