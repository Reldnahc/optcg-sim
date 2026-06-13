import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses optional trash cost into deck-to-life movement followed by self cost gain", () => {
  const result = parseCardEffectLine(
    "[On Play] You may trash 1 card from your hand: Add up to 1 card from the top of your deck to the top of your Life cards. Then, this Character gains +2 cost until the end of your opponent's next End Phase.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: { type: "trashFromHand", count: 1 },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "moveCards",
                    min: 0,
                    count: 1,
                    from: { player: "self", zone: "deck", position: "top" },
                    to: { player: "self", zone: "life", position: "top" },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "modifyCost",
                    target: { type: "self" },
                    value: 2,
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
      "entry:onPlay",
      "composition:optionalCostedEffect",
      "cost:trashFromHand",
      "instruction:moveCards",
      "destination:life",
      "instruction:modifyCost",
      "target:thisCharacter",
      "duration:opponentNextEndPhase",
    ]),
  );
});
