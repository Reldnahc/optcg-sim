import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses owner-deck-bottom field movement as an optional cost into a reusable keyword grant body", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] You may place 1 of your Characters at the bottom of the owner's deck: This Character gains [Rush] during this turn.",
  );

  expect(result).toMatchObject({
    block: {
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
                count: 1,
                chooser: "self",
                from: { player: "self", zone: "characterArea" },
                to: { player: "self", zone: "deck", position: "bottom" },
                filter: { categories: ["character"] },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "giveKeyword",
              target: { type: "self" },
              keyword: "rush",
              duration: { type: "thisTurn" },
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
      "zone:characterArea",
      "destination:deck",
      "position:bottom",
      "filter:category:character",
      "instruction:giveKeyword",
      "target:thisCharacter",
      "duration:thisTurn",
    ]),
  );
});

it("parses this Character owner-deck-bottom movement as an optional cost into a reusable debuff body", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may place this Character at the bottom of the owner's deck: Give up to 1 of your opponent's Characters -3000 power during this turn.",
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
              cost: {
                type: "moveCards",
                count: 1,
                chooser: "self",
                from: {
                  player: "self",
                  zone: "characterArea",
                  source: "effectSource",
                },
                to: { player: "self", zone: "deck", position: "bottom" },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              value: -3000,
              duration: { type: "thisTurn" },
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
      "cost:moveCards",
      "target:thisCharacter",
      "zone:characterArea",
      "destination:deck",
      "position:bottom",
      "instruction:modifyPower",
      "duration:thisTurn",
    ]),
  );
});
