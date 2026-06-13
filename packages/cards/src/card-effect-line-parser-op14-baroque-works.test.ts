import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP14 Baroque Works parser support", () => {
  it("parses leader-type condition with independently quantified trash plays", () => {
    const result = parseCardEffectLine(
      '[On Play] If your Leader\'s type includes "Baroque Works", play up to 1 Character card with a type including "Baroque Works" and a cost of 4 or less and up to 1 Character card with a type including "Baroque Works" and a cost of 1 from your trash.',
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        condition: {
          type: "hasCardInZone",
          player: "self",
          zone: "leaderArea",
          filter: {
            typesIncludeAny: ["Baroque Works"],
          },
        },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "selectCards", zone: "trash" } },
            { effect: { type: "playSelected" } },
            { effect: { type: "selectCards", zone: "trash" } },
            { effect: { type: "playSelected" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "condition:leaderIdentity",
        "instruction:playSelected",
        "zone:trash",
        "filter:type",
        "filter:cost",
        "composition:selectThenPlay",
        "expression:sequence",
      ]),
    );
  });
});
