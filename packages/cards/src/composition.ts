import type { PrimitiveParseResult } from "./types.js";

export function composeWrapperAndBody(
  wrapper: PrimitiveParseResult,
  body: PrimitiveParseResult,
): PrimitiveParseResult {
  return {
    node: {
      type: "composition",
      composition: "wrapperBody",
      wrapper: wrapper.node,
      body: body.node,
    },
    evidence: [
      ...wrapper.evidence,
      ...body.evidence,
      "composition:wrapperBody",
    ],
  };
}
