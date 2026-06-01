import { describe, expect, it } from "vitest";

import { parseUpToCardinality, upToCardinalityPrimitive } from "./up-to.js";

describe("up to cardinality parser", () => {
  it("defines up to N as a cardinality primitive parent", () => {
    expect(upToCardinalityPrimitive).toEqual({
      primitiveId: "cardinality:upTo",
      matches: [{ id: "up-to-n" }],
    });
  });

  it("parses up to count and leaves target text", () => {
    expect(
      parseUpToCardinality({
        text: "up to 1 of your opponent's Characters",
      }),
    ).toEqual({
      cardinality: { mode: "upTo", min: 0, max: 1 },
      evidence: ["cardinality:upTo", "count:positiveInteger"],
      rest: "of your opponent's Characters",
    });
  });

  it("parses shared-total wording without changing cardinality semantics", () => {
    expect(
      parseUpToCardinality({
        text: "up to a total of 2 of your opponent's Characters or DON!! cards",
      }),
    ).toEqual({
      cardinality: { mode: "upTo", min: 0, max: 2 },
      evidence: ["cardinality:upTo", "count:positiveInteger"],
      rest: "of your opponent's Characters or DON!! cards",
    });
  });
});
