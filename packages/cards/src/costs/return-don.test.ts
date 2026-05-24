import { describe, expect, it } from "vitest";

import { parseReturnDonCost, returnDonCostPrimitive } from "./return-don.js";

describe("return DON cost parser", () => {
  it("defines return DON as a cost primitive parent", () => {
    expect(returnDonCostPrimitive).toEqual({
      primitiveId: "cost:returnDon",
      matches: [{ id: "don-minus-n" }],
    });
  });

  it.each(["DON!! −1:", "DON!! -1:"])("parses %s", (text) => {
    expect(parseReturnDonCost({ text: `${text} Draw 1 card.` })).toEqual({
      cost: { type: "returnDon", count: 1 },
      evidence: ["cost:returnDon", "count:positiveInteger"],
      rest: "Draw 1 card.",
    });
  });
});
