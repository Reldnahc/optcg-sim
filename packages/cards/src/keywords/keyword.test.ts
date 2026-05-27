import { describe, expect, it } from "vitest";

import { keywordPrimitive, parseKeyword } from "./keyword.js";

describe("keyword parser", () => {
  it("defines supported keyword as a keyword primitive parent", () => {
    expect(keywordPrimitive).toEqual({
      primitiveId: "keyword:anySupported",
      matches: [{ id: "bracketed-supported-keyword" }],
    });
  });

  it.each([
    ["[Blocker]", "blocker"],
    ["[Banish]", "banish"],
    ["[Rush]", "rush"],
    ["[Rush:Character]", "rushCharacter"],
    ["[Double Attack]", "doubleAttack"],
  ])("parses %s", (text, keyword) => {
    expect(parseKeyword({ text })).toEqual({
      keyword,
      evidence: ["keyword:anySupported"],
      rest: "",
    });
  });

  it("ignores parenthetical reminder text after a raw keyword", () => {
    expect(
      parseKeyword({
        text: "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
      }),
    ).toEqual({
      keyword: "blocker",
      evidence: ["keyword:anySupported"],
      rest: "",
    });
  });
});
