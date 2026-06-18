import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses return-DON cost into all-other-character deck-bottom then extra-turn sequence", () => {
  const result = parseCardEffectLine(
    "[On Play] DON!! −10: Place all of your Characters except this Character at the bottom of your deck in any order. Then, take an extra turn after this one.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            id: "cost:returnDon",
            connector: "always",
            effect: {
              type: "payCost",
              cost: { type: "returnDon", count: 10, optional: true },
            },
          },
          {
            id: "body:after-cost",
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "bounce",
                    destination: "deckBottom",
                    target: {
                      type: "all",
                      player: "self",
                      zone: "characterArea",
                      filter: {
                        categories: ["character"],
                        excludeSelf: true,
                      },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: { type: "takeExtraTurn", player: "self" },
                },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "composition:costedEffect",
      "cost:returnDon",
      "instruction:bounce",
      "filter:excludeSelf",
      "instruction:takeExtraTurn",
    ]),
  );
});
