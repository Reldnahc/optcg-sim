import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses filtered trash-to-bottom cost before conditional trash play without coupling the primitives", () => {
  const parsed = parseCardEffectLine(
    "[On Play] You may place 3 {Revolutionary Army} type cards from your trash at the bottom of your deck in any order: If your Leader has the {Revolutionary Army} type, play up to 1 Character card with a cost of 6 or less from your trash.",
  );

  expect(parsed).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 3,
                from: { player: "self", zone: "trash" },
                to: { player: "self", zone: "deck", position: "bottom" },
                filter: {
                  typesAny: ["Revolutionary Army"],
                },
                optional: true,
              },
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
                filter: { typesAny: ["Revolutionary Army"] },
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: {
                      type: "selectCards",
                      zone: "trash",
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        cost: { max: 6 },
                      },
                    },
                  },
                  {
                    connector: "ifPossible",
                    effect: { type: "playSelected", ignoreCost: true },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "cost:moveCards",
      "cardinality:exact",
      "count:positiveInteger",
      "player:self",
      "zone:trash",
      "destination:deck",
      "position:bottom",
      "order:anyOrder",
      "filter:type",
      "condition:leaderIdentity",
      "instruction:playSelected",
      "cardinality:upTo",
      "zone:trash",
      "filter:category:character",
      "filter:cost",
      "composition:selectThenPlay",
      "composition:entryExpression",
    ]),
  );
});

it("parses named hand-trash and owner-bottom costs before exact trash play", () => {
  const result = parseCardEffectLine(
    "[Main] You may trash 1 [Ice Oni] from your hand and place 1 Character with a cost of 4 or less at the bottom of the owner's deck: Play 1 [Ice Oni] from your trash.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "sequence",
                optional: true,
                costs: [
                  {
                    type: "trashFromHand",
                    count: 1,
                    filter: { names: ["Ice Oni"] },
                  },
                  {
                    type: "moveCards",
                    count: 1,
                    from: { player: "self", zone: "characterArea" },
                    to: {
                      player: "self",
                      zone: "deck",
                      position: "bottom",
                    },
                    filter: {
                      categories: ["character"],
                      cost: { max: 4 },
                    },
                  },
                ],
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
                    type: "selectCards",
                    zone: "trash",
                    min: 1,
                    max: 1,
                    filter: { names: ["Ice Oni"] },
                  },
                },
                {
                  connector: "ifPossible",
                  effect: { type: "playSelected" },
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
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:trashFromHand",
      "cost:moveCards",
      "destination:deck",
      "position:bottom",
      "instruction:playSelected",
      "zone:trash",
      "filter:name",
      "composition:selectThenPlay",
    ]),
  );
});
