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

it("parses filtered Stage owner-deck-bottom movement as an optional cost into K.O.", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] You may place 1 Stage with a cost of 1 at the bottom of the owner's deck: K.O. up to 1 of your opponent's Characters with a cost of 2 or less.",
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
                from: { player: "self", zone: "stageArea" },
                to: { player: "self", zone: "deck", position: "bottom" },
                filter: { categories: ["stage"], cost: { op: "eq", value: 1 } },
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
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      min: 0,
                      max: 1,
                      filter: { categories: ["character"], cost: { max: 2 } },
                    },
                  },
                },
                { effect: { type: "ko" } },
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
      "zone:stageArea",
      "filter:category:stage",
      "filter:cost",
      "destination:deck",
      "position:bottom",
      "instruction:ko",
      "target:opponentCharacters",
    ]),
  );
});

it("reuses filtered Stage owner-deck-bottom cost before a search body", () => {
  const result = parseCardEffectLine(
    "[On Play] You may place 1 Stage with a cost of 1 at the bottom of the owner's deck: Look at 5 cards from the top of your deck; reveal up to 1 [Upper Yard] or {Shandian Warrior} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
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
                count: 1,
                from: { player: "self", zone: "stageArea" },
                to: { player: "self", zone: "deck", position: "bottom" },
                filter: { categories: ["stage"], cost: { op: "eq", value: 1 } },
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                { effect: { type: "revealTop", count: 5 } },
                { effect: { type: "selectFromSet", min: 0, max: 1 } },
                { effect: { type: "revealSelected" } },
                { effect: { type: "moveSelected", to: "hand" } },
                { effect: { type: "placeSetRemainder" } },
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
      "cost:moveCards",
      "zone:stageArea",
      "filter:category:stage",
      "instruction:revealTop",
      "look:topDeck",
      "instruction:revealSelected",
      "instruction:placeSetRemainder",
      "composition:optionalCostedEffect",
    ]),
  );
});
