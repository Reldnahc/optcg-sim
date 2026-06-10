import { describe, expect, it } from "vitest";

import { parseRestFromFieldCost } from "./rest-from-field.js";

describe("rest from field cost parser", () => {
  it("parses generic own field card rest as a reusable cost primitive", () => {
    expect(parseRestFromFieldCost({ text: "rest 1 of your cards" })).toEqual({
      cost: {
        type: "restFromField",
        count: 1,
        chooser: "self",
        optional: true,
      },
      evidence: [
        "cost:restFromField",
        "cardinality:exact",
        "count:positiveInteger",
        "chooser:self",
        "player:self",
        "filter:any",
      ],
      rest: "",
    });
  });

  it("parses filtered own Character rest without binding it to one body", () => {
    expect(
      parseRestFromFieldCost({
        text: "rest 2 of your {Straw Hat Crew} type Characters",
      }),
    ).toEqual({
      cost: {
        type: "restFromField",
        count: 2,
        chooser: "self",
        filter: { categories: ["character"], typesAny: ["Straw Hat Crew"] },
        optional: true,
      },
      evidence: [
        "cost:restFromField",
        "cardinality:exact",
        "count:positiveInteger",
        "chooser:self",
        "player:self",
        "filter:type",
        "filter:category:character",
      ],
      rest: "",
    });
  });
});
