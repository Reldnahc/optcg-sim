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

  it("parses rest-any-number own DON as a variable reusable cost primitive", () => {
    expect(
      parseRestDonCost({ text: "rest any number of your DON!! cards" }),
    ).toEqual({
      cost: {
        type: "restDon",
        count: 0,
        maxCount: "available",
        chooser: "self",
        optional: true,
      },
      evidence: [
        "cost:restDon",
        "count:anyNumber",
        "target:yourDonCards",
        "player:self",
        "chooser:self",
      ],
      rest: "",
    });
  });

  it("parses Unicode circled rest-DON shorthand as a reusable cost primitive", () => {
    expect(
      parseRestDonCost({
        text: "➁ (You may rest the specified number of DON!! cards in your cost area.)",
      }),
    ).toEqual({
      cost: {
        type: "restDon",
        count: 2,
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

  it("parses bare Unicode circled rest-DON shorthand as the same cost primitive", () => {
    expect(parseRestDonCost({ text: "\u2460" })).toEqual({
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
});
