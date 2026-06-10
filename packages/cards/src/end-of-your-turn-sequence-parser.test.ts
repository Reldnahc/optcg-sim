import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses end-of-turn return-DON cost into self activation and keyword grant", () => {
  const result = parseCardEffectLine(
    "[End of Your Turn] DON!! −2: Set this Character as active. Then, this Character gains [Blocker] until the end of your opponent's next End Phase.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "endOfYourTurn" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "returnDon",
                count: 2,
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "activate",
                    target: { type: "self" },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "giveKeyword",
                    target: { type: "self" },
                    keyword: "blocker",
                    duration: {
                      type: "untilEndOfNextTurn",
                      player: "opponent",
                    },
                  },
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
      "entry:endOfYourTurn",
      "cost:returnDon",
      "instruction:activate",
      "target:thisCharacter",
      "state:active",
      "instruction:giveKeyword",
      "keyword:anySupported",
      "duration:opponentNextEndPhase",
      "expression:sequence",
    ]),
  );
});
