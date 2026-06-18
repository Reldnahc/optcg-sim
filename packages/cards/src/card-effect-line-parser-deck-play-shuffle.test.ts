import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses DON-return On K.O. deck play and shuffle as reusable sequence primitives", () => {
  const result = parseCardEffectLine(
    "[Opponent's Turn] [On K.O.] DON!! −1 (You may return the specified number of DON!! cards from your field to your DON!! deck.): Play up to 1 [Baron Tamago] with a cost of 4 or less from your deck. Then, shuffle your deck.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onKO" },
      effect: {
        type: "sequence",
        effects: [
          {
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
                  effect: {
                    type: "selectCards",
                    zone: "deck",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: {
                      names: ["Baron Tamago"],
                      cost: { max: 4 },
                    },
                    visibility: "chooserOnly",
                  },
                },
                {
                  effect: {
                    type: "playSelected",
                    ignoreCost: true,
                  },
                },
                {
                  connector: "then",
                  effect: { type: "shuffleDeck", player: "self" },
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
      "entry:opponentTurn",
      "condition:opponentTurn",
      "entry:onKO",
      "cost:returnDon",
      "instruction:selectCards",
      "instruction:playSelected",
      "instruction:shuffleDeck",
      "zone:deck",
      "filter:name",
      "filter:cost",
    ]),
  );
});

it("parses circled rest-DON Activate Main deck play and comma shuffle wording", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] [Activate: Main] [Once Per Turn] ➁ (You may rest the specified number of DON!! cards in your cost area.): Play up to 1 [Pacifista] with a cost of 4 or less from your deck, then shuffle your deck.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: 1,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: { type: "restDon", count: 2, optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "deck",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: {
                      names: ["Pacifista"],
                      cost: { max: 4 },
                    },
                    visibility: "chooserOnly",
                  },
                },
                {
                  effect: {
                    type: "playSelected",
                    ignoreCost: true,
                  },
                },
                {
                  connector: "then",
                  effect: { type: "shuffleDeck", player: "self" },
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
      "marker:attachedDon",
      "entry:activateMain",
      "marker:oncePerTurn",
      "cost:restDon",
      "instruction:selectCards",
      "instruction:playSelected",
      "instruction:shuffleDeck",
      "zone:deck",
      "filter:name",
      "filter:cost",
    ]),
  );
});
