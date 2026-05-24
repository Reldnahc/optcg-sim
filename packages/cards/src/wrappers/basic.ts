import type { PrimitiveParseResult } from "../types.js";

export function parseOnPlayWrapper(text: string): PrimitiveParseResult {
  if (text !== "[On Play]") {
    throw new Error("Unsupported wrapper");
  }

  return {
    node: { type: "wrapper", wrapper: "onPlay" },
    evidence: ["wrapper:onPlay", "sourcePresence:mustRemain"],
  };
}

export function parseOnKoWrapper(text: string): PrimitiveParseResult {
  if (text !== "[On K.O.]") {
    throw new Error("Unsupported wrapper");
  }

  return {
    node: { type: "wrapper", wrapper: "onKO" },
    evidence: ["wrapper:onKO", "sourcePresence:resolveFromDestination"],
  };
}
