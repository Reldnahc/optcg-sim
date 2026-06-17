import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it.each([
  {
    line: "[Activate: Main] You may place this Character and 1 [Kin'emon] with 0 power from your trash at the bottom of your deck in any order: Play up to 1 [Kin'emon] with a cost of 6 from your hand.",
    name: "Kin'emon",
    power: 0,
  },
  {
    line: "[Activate: Main] You may place this Character and 1 [Kin'emon] with 1000 power from your trash at the bottom of your deck in any order: Play up to 1 [Kin'emon] with a cost of 6 from your hand.",
    name: "Kin'emon",
    power: 1000,
  },
  {
    line: "[Activate: Main] You may place this Character and 1 [Example] with 2000 power from your trash at the bottom of your deck in any order: Play up to 1 [Example] with a cost of 6 from your hand.",
    name: "Example",
    power: 2000,
  },
])(
  "parses source-plus-filtered-trash bottom-deck costs before independent hand play %#",
  ({ line, name, power }) => {
    const parsed = parseCardEffectLine(line);

    expect(parsed).toMatchObject({
      block: {
        trigger: { type: "activateMain" },
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
                      type: "moveCards",
                      count: 1,
                      from: {
                        player: "self",
                        zone: "characterArea",
                        source: "effectSource",
                      },
                      to: {
                        player: "self",
                        zone: "deck",
                        position: "bottom",
                      },
                    },
                    {
                      type: "moveCards",
                      count: 1,
                      from: { player: "self", zone: "trash" },
                      to: {
                        player: "self",
                        zone: "deck",
                        position: "bottom",
                      },
                      filter: {
                        names: [name],
                        power: { op: "eq", value: power },
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
                      zone: "hand",
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      filter: {
                        names: [name],
                        cost: { op: "eq", value: 6 },
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
          ],
        },
      },
    });
    expect(parsed?.evidence).toEqual(
      expect.arrayContaining([
        "entry:activateMain",
        "composition:optionalCostedEffect",
        "composition:costSequence",
        "cost:moveCards",
        "target:thisCharacter",
        "zone:characterArea",
        "zone:trash",
        "destination:deck",
        "position:bottom",
        "filter:name",
        "filter:power",
        "instruction:playSelected",
        "zone:hand",
        "filter:cost",
        "composition:selectThenPlay",
      ]),
    );
  },
);

it("parses source-plus-hand bottom-deck costs before an independent body", () => {
  const parsed = parseCardEffectLine(
    "[Activate: Main] You may place this card and 1 card from your hand at the bottom of your deck in any order: Draw 2 cards.",
  );

  expect(parsed).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
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
                    type: "moveCards",
                    count: 1,
                    from: {
                      player: "self",
                      zone: "characterArea",
                      source: "effectSource",
                    },
                    to: {
                      player: "self",
                      zone: "deck",
                      position: "bottom",
                    },
                  },
                  {
                    type: "moveCards",
                    count: 1,
                    from: { player: "self", zone: "hand" },
                    to: {
                      player: "self",
                      zone: "deck",
                      position: "bottom",
                    },
                  },
                ],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", count: 2 },
          },
        ],
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:moveCards",
      "target:thisCard",
      "zone:characterArea",
      "zone:hand",
      "destination:deck",
      "position:bottom",
      "instruction:draw",
    ]),
  );
});
