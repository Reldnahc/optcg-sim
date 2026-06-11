import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser field activation", () => {
  it("parses filtered Leader activation followed by top-Life-to-hand movement", () => {
    const result = parseCardEffectLine(
      "[On Play] Set your {Fish-Man} type Leader as active. Then, add 1 card from the top of your Life cards to your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "activate",
                target: {
                  type: "all",
                  player: "self",
                  zone: "leaderArea",
                  filter: {
                    categories: ["leader"],
                    typesAny: ["Fish-Man"],
                  },
                },
              },
            },
            {
              connector: "then",
              effect: {
                type: "moveCards",
                count: 1,
                from: { player: "self", zone: "life", position: "top" },
                to: { player: "self", zone: "hand" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:activate",
        "target:yourLeader",
        "zone:leaderArea",
        "filter:type",
        "instruction:moveCards",
        "zone:life",
        "position:top",
        "destination:hand",
        "composition:entryExpression",
      ]),
    );
  });
});
