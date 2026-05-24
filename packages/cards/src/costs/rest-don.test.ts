import { describe, expect, it } from "vitest";

import { parseRestDonCost } from "./rest-don.js";

describe("rest DON cost parser", () => {
  it("parses rest-N own DON as a reusable cost primitive", () => {
    expect(parseRestDonCost({ text: "rest 1 of your DON!! cards" })).toEqual({
      cost: {
        type: "restDon",
        count: 1,
        chooser: "self",
        optional: true,
      },
      evidence: [
        "cost:restDon",
        "cardinality:exact",
        "count:positiveInteger",
        "target:yourDonCards",
        "player:self",
        "chooser:self",
      ],
      rest: "",
    });
  });

  it("emits action, cardinality, and target evidence separately", () => {
    expect(
      parseRestDonCost({ text: "rest 2 of your DON!! cards" })?.evidence,
    ).toEqual([
      "cost:restDon",
      "cardinality:exact",
      "count:positiveInteger",
      "target:yourDonCards",
      "player:self",
      "chooser:self",
    ]);
  });
});
