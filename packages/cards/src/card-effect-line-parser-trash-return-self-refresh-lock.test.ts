import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses trash-to-deck return cost before self activation and self refresh lock", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] You may return 7 cards from your trash to the bottom of your deck in any order: Set this Character as active. Then, this Character will not become active in your next Refresh Phase.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 7,
                from: { player: "self", zone: "trash" },
                to: { player: "self", zone: "deck", position: "bottom" },
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
                  effect: { type: "activate", target: { type: "self" } },
                },
                {
                  connector: "then",
                  effect: {
                    type: "cannotBecomeActive",
                    target: { type: "self" },
                    duration: { type: "untilStartOfNextTurn", player: "self" },
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
      "entry:activateMain",
      "marker:oncePerTurn",
      "composition:optionalCostedEffect",
      "cost:moveCards",
      "zone:trash",
      "destination:deck",
      "position:bottom",
      "instruction:activate",
      "target:thisCharacter",
      "instruction:preventActivation",
      "duration:selfNextRefreshPhase",
      "composition:entryExpression",
    ]),
  );
});
