import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses optional rest-self cost into typed Leader power gain without binding cost to body", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest this Character: Your {Supernovas} type Leader gains +1000 power until the end of your opponent's next turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "payCost", cost: { type: "restSelf" } },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              target: {
                type: "all",
                zone: "leaderArea",
                player: "self",
                filter: {
                  categories: ["leader"],
                  typesAny: ["Supernovas"],
                },
              },
              value: 1000,
              duration: { type: "untilEndOfNextTurn", player: "opponent" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "composition:optionalCostedEffect",
      "cost:restSelf",
      "instruction:modifyPower",
      "target:yourLeader",
      "filter:type",
      "filter:category:leader",
      "modifier:positivePower",
      "duration:opponentNextEndPhase",
    ]),
  );
});
