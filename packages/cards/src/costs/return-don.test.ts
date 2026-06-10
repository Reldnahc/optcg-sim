import { describe, expect, it } from "vitest";

import {
  parseReturnDonCost,
  parseReturnDonSequenceCost,
  returnDonCostPrimitive,
} from "./return-don.js";

describe("return DON cost parser", () => {
  it("defines return DON as a cost primitive parent", () => {
    expect(returnDonCostPrimitive).toEqual({
      primitiveId: "cost:returnDon",
      matches: [{ id: "don-minus-n" }, { id: "return-active-don" }],
    });
  });

  it.each(["DON!! −1:", "DON!! -1:"])("parses %s", (text) => {
    expect(parseReturnDonCost({ text: `${text} Draw 1 card.` })).toEqual({
      cost: { type: "returnDon", count: 1 },
      evidence: ["cost:returnDon", "count:positiveInteger"],
      rest: "Draw 1 card.",
    });
  });

  it("parses explicit active DON return as the same state-constrained cost primitive", () => {
    expect(
      parseReturnDonSequenceCost({
        text: "return 8 of your active DON!! cards to your DON!! deck",
      }),
    ).toEqual({
      cost: {
        type: "returnDon",
        count: 8,
        sourceState: "active",
        optional: true,
      },
      evidence: ["cost:returnDon", "count:positiveInteger", "state:active"],
      rest: "",
    });
  });
});
