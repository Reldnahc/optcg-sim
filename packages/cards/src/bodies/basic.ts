import type { PrimitiveParseResult } from "../types.js";

export function parseDrawBody(text: string): PrimitiveParseResult {
  if (!/^Draw [1-9]\d* cards?\.$/.test(text)) {
    throw new Error("Unsupported draw body");
  }

  return {
    node: { type: "body", effectType: "draw" },
    evidence: ["body:draw", "count:positiveInteger"],
  };
}

export function parseTrashFromHandBody(text: string): PrimitiveParseResult {
  if (!/^Trash [1-9]\d* cards? from your hand\.$/.test(text)) {
    throw new Error("Unsupported trash-from-hand body");
  }

  return {
    node: { type: "body", effectType: "trashFromHand" },
    evidence: ["body:trashFromHand", "count:positiveInteger"],
  };
}
