import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses optional filtered reveal-from-hand cost into reusable K.O. body", () => {
  const result = parseCardEffectLine(
    "[On Play] You may reveal 1 Character card with 8000 power from your hand: K.O. up to 1 of your opponent's Characters with 2000 base power or less.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "revealFromHand",
                count: 1,
                chooser: "self",
                optional: true,
                filter: {
                  categories: ["character"],
                  power: { op: "eq", value: 8000 },
                },
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
                  saveResultAs: "selected:ko-target",
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      filter: {
                        categories: ["character"],
                        power: { max: 2000 },
                      },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: { type: "ko" },
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
      "cost:revealFromHand",
      "reveal:bothPlayers",
      "instruction:ko",
      "filter:power",
      "composition:selectThenApply",
    ]),
  );
});

it("parses optional filtered reveal-from-hand cost into reusable draw body", () => {
  const result = parseCardEffectLine(
    "[On Play] You may reveal 1 Character card with 8000 power from your hand: Draw 1 card.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "revealFromHand",
                count: 1,
                chooser: "self",
                optional: true,
                filter: {
                  categories: ["character"],
                  power: { op: "eq", value: 8000 },
                },
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", count: 1, player: "self" },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "composition:optionalCostedEffect",
      "cost:revealFromHand",
      "instruction:draw",
    ]),
  );
});

it("parses optional filtered reveal-from-hand cost into reusable power debuff body", () => {
  const result = parseCardEffectLine(
    "[On Play] You may reveal 2 Character cards with 8000 power from your hand: Give up to 1 of your opponent's Characters -6000 power during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "revealFromHand",
                count: 2,
                chooser: "self",
                optional: true,
                filter: {
                  categories: ["character"],
                  power: { op: "eq", value: 8000 },
                },
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              value: -6000,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "cost:revealFromHand",
      "instruction:modifyPower",
      "modifier:negativePower",
    ]),
  );
});

it("parses optional filtered hand-trash On K.O. cost into play-this-from-trash body", () => {
  const result = parseCardEffectLine(
    "[On K.O.] You may trash 1 Character card with 8000 power from your hand: Play this Character card from your trash.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onKO" },
      sourcePresencePolicy: "resolveFromDestinationZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "trashFromHand",
                count: 1,
                chooser: "self",
                optional: true,
                filter: {
                  categories: ["character"],
                  power: { op: "eq", value: 8000 },
                },
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "playSource", ignoreCost: true },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onKO",
      "cost:trashFromHand",
      "filter:power",
      "instruction:playSource",
    ]),
  );
});

it("parses opponent-attack filtered hand-trash cost into base-power body", () => {
  const result = parseCardEffectLine(
    "[On Your Opponent's Attack] You may trash 1 Character card with 8000 power from your hand: Your Leader and this Character's base power becomes 7000 during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onOpponentAttack" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "trashFromHand",
                count: 1,
                chooser: "self",
                optional: true,
                filter: {
                  categories: ["character"],
                  power: { op: "eq", value: 8000 },
                },
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                { effect: { type: "setBasePower", value: 7000 } },
                { effect: { type: "setBasePower", value: 7000 } },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onOpponentAttack",
      "cost:trashFromHand",
      "instruction:setBasePower",
    ]),
  );
});

it("parses trash-this-Stage cost into rested DON attachment body", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may trash this Stage: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.",
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
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: { type: "trashSelf", optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                { effect: { type: "selectCards", zone: "costArea" } },
                { effect: { type: "selectTargets" } },
                { effect: { type: "attachSelectedDon" } },
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
      "cost:trashSelf",
      "instruction:attachDon",
    ]),
  );
});

it("parses hand Character counter setting as a reusable continuous primitive", () => {
  const result = parseCardEffectLine(
    "The counter of all of your Character cards with 8000 power in your hand becomes +2000.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "modifyCounter",
        player: "self",
        filter: {
          categories: ["character"],
          power: { op: "eq", value: 8000 },
        },
        value: 2000,
        duration: { type: "whileSourceOnField" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "instruction:modifyCounter",
      "zone:hand",
      "filter:category:character",
      "filter:power",
      "modifier:positiveCounter",
    ]),
  );
});

it("parses field-wide no-counter Character cards as a reusable hand counter modifier", () => {
  const result = parseCardEffectLine(
    "All of your {Land of Wano} type Character cards without a Counter have a +1000 Counter, according to the rules.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "modifyCounter",
        player: "self",
        sourceZone: "hand",
        filter: {
          categories: ["character"],
          typesAny: ["Land of Wano"],
          counter: { max: 0 },
        },
        value: 1000,
        duration: { type: "whileSourceOnField" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "instruction:modifyCounter",
      "zone:hand",
      "filter:type",
      "filter:category:character",
      "filter:counter",
      "modifier:positiveCounter",
    ]),
  );
});

it("parses On Play/On K.O. search with name-or-type-including reveal filter", () => {
  const result = parseCardEffectLine(
    '[On Play]/[On K.O.] Look at 5 cards from the top of your deck; reveal up to 1 [Monkey.D.Luffy] or up to 1 card with a type including "Whitebeard Pirates" and add it to your hand. Then, place the rest at the bottom of your deck in any order.',
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "revealTop", count: 5 } },
          {
            effect: {
              type: "selectFromSet",
              min: 0,
              max: 1,
              filter: {
                anyOf: [
                  { names: ["Monkey.D.Luffy"] },
                  { typesIncludeAny: ["Whitebeard Pirates"] },
                ],
              },
            },
          },
          { effect: { type: "revealSelected" } },
          { effect: { type: "moveSelected", to: "hand" } },
          { effect: { type: "placeSetRemainder", position: "bottom" } },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "composition:entryAlternatives",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:revealSelected",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "look:topDeck",
      "filter:anyOf",
      "filter:name",
      "filter:type",
      "reveal:bothPlayers",
      "remaining:bottomDeck",
    ]),
  );
});
