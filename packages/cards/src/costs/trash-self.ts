import type { CostParseResult } from "./rest-don.js";
import type { ParseInput } from "../types.js";

export function parseTrashSelfCost(
  input: ParseInput,
): CostParseResult | undefined {
  const match = /^trash this (?<target>card|Character|Stage)$/i.exec(
    input.text,
  );
  const target = match?.groups?.["target"];
  if (target === undefined) {
    return undefined;
  }

  return {
    cost: { type: "trashSelf", optional: true },
    evidence: [
      "cost:trashSelf",
      target.toLowerCase() === "character"
        ? "target:thisCharacter"
        : target.toLowerCase() === "stage"
          ? "target:thisStage"
          : "target:thisCard",
    ],
    rest: "",
  };
}
