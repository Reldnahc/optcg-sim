import { describe, expect, it } from "vitest";

import { parseRestSelfCost } from "./rest-self.js";

describe("rest self cost parser", () => {
  it("parses rest this card as a reusable rest-self cost primitive", () => {
    expect(parseRestSelfCost({ text: "rest this card" })).toEqual({
      cost: { type: "restSelf", optional: true },
      evidence: ["cost:restSelf", "target:thisCard"],
      rest: "",
    });
  });

  it("parses rest this Stage as the same reusable rest-self cost primitive", () => {
    expect(parseRestSelfCost({ text: "rest this Stage" })).toEqual({
      cost: { type: "restSelf", optional: true },
      evidence: ["cost:restSelf", "target:thisCard"],
      rest: "",
    });
  });

  it("parses rest this Leader as the same reusable rest-self cost primitive", () => {
    expect(parseRestSelfCost({ text: "rest this Leader" })).toEqual({
      cost: { type: "restSelf", optional: true },
      evidence: ["cost:restSelf", "target:thisCard"],
      rest: "",
    });
  });
});
