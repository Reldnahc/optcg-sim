import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses return-DON reminder text before an optional cost body", () => {
  const result = parseCardEffectLine(
    "[Main] DON!! -1 (You may return the specified number of DON!! cards from your field to your DON!! deck.) You may trash this Character: Draw 1 card.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: { type: "returnDon", count: 1, optional: true },
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
                    type: "payCost",
                    cost: { type: "trashSelf", optional: true },
                  },
                },
                {
                  connector: "ifYouDo",
                  effect: { type: "draw", player: "self", count: 1 },
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
      "entry:eventMain",
      "composition:costedEffect",
      "cost:returnDon",
      "composition:optionalCostedEffect",
      "cost:trashSelf",
      "instruction:draw",
    ]),
  );
});

it("reuses nested return-DON and self-trash costs before conditional hand-or-trash play", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] DON!! -1 (You may return the specified number of DON!! cards from your field to your DON!! deck.) You may trash this Character: If your Leader has the {GERMA 66} type, play up to 1 [Vinsmoke Ichiji] with a cost of 7 from your hand or trash.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: { type: "returnDon", count: 1, optional: true },
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
                    type: "payCost",
                    cost: { type: "trashSelf", optional: true },
                  },
                },
                {
                  connector: "ifYouDo",
                  effect: {
                    type: "conditional",
                    if: {
                      type: "hasCardInZone",
                      player: "self",
                      zone: "leaderArea",
                      filter: { typesAny: ["GERMA 66"] },
                    },
                    then: {
                      type: "choice",
                      chooser: "self",
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
      "entry:activateMain",
      "composition:costedEffect",
      "cost:returnDon",
      "composition:optionalCostedEffect",
      "cost:trashSelf",
      "condition:leaderIdentity",
      "instruction:playSelected",
      "zone:hand",
      "zone:trash",
      "filter:name",
      "filter:cost",
      "composition:selectThenPlay",
    ]),
  );
});
