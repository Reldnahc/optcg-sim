import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses rest-self activation cost before exact opponent Character rest", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest this Character: Rest 1 of your opponent's Characters with a cost of 2 or less.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "payCost", cost: { type: "restSelf" } } },
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
                      min: 1,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        cost: { max: 2 },
                      },
                    },
                  },
                },
                { effect: { type: "rest" } },
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
      "cost:restSelf",
      "instruction:rest",
      "cardinality:exact",
      "target:opponentCharacters",
      "filter:cost",
      "composition:optionalCostedEffect",
    ]),
  );
});

it("parses rest-self activation cost before typed each-target rested DON attachment", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest this Character: Give up to 1 rested DON!! card to each of your {Alabasta} type Characters.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "payCost", cost: { type: "restSelf" } } },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectAllTargets",
                    request: {
                      player: "self",
                      zone: "characterArea",
                      filter: {
                        categories: ["character"],
                        typesAny: ["Alabasta"],
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "forEachSavedTarget",
                    effect: {
                      type: "sequence",
                      effects: [
                        {
                          effect: {
                            type: "selectCards",
                            max: 1,
                            filter: { categories: ["don"], state: "rested" },
                          },
                        },
                        { effect: { type: "attachSelectedDon" } },
                      ],
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
      "cost:restSelf",
      "instruction:selectAllTargets",
      "instruction:selectCards",
      "instruction:attachDon",
      "filter:type",
      "filter:category:character",
      "filter:category:don",
      "filter:state:rested",
      "composition:forEachSavedTarget",
      "composition:optionalCostedEffect",
    ]),
  );
});

it("parses symbol-DON plus rest-self cost before generic top-deck search", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] ➀ (You may rest the specified number of DON!! cards in your cost area) You may rest this Character: Look at 5 cards from the top of your deck; reveal up to 1 {Land of Wano} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: {
                type: "sequence",
                costs: [{ type: "restDon", count: 1 }, { type: "restSelf" }],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                { effect: { type: "revealTop", count: 5 } },
                {
                  effect: {
                    type: "selectFromSet",
                    filter: {
                      typesAny: ["Land of Wano"],
                    },
                  },
                },
                { effect: { type: "revealSelected" } },
                { effect: { type: "moveSelected", to: "hand" } },
                { effect: { type: "placeSetRemainder", position: "bottom" } },
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
      "composition:costSequence",
      "cost:restDon",
      "cost:restSelf",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:revealSelected",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "filter:type",
      "composition:optionalCostedEffect",
    ]),
  );
});

it("parses target-first rested DON attachment to this Character", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] Give this Character up to 2 rested DON!! cards.",
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
            effect: {
              type: "selectCards",
              max: 2,
              filter: { categories: ["don"], state: "rested" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "attachSelectedDon",
              target: { type: "self" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "instruction:selectCards",
      "instruction:attachDon",
      "target:thisCharacter",
      "filter:category:don",
      "filter:state:rested",
      "composition:selectThenApply",
    ]),
  );
});

it("parses optional Life cost before self power gain and self rested DON attachment", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] You may add 1 card from the top of your Life cards to your hand: This Character gains +2000 power during this turn. Then, give this Character up to 2 rested DON!! cards.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "payCost", cost: { type: "moveCards" } } },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "modifyPower",
                    target: { type: "self" },
                    value: 2000,
                    duration: { type: "thisTurn" },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "sequence",
                    effects: [
                      {
                        effect: {
                          type: "selectCards",
                          max: 2,
                          filter: { categories: ["don"], state: "rested" },
                        },
                      },
                      {
                        effect: {
                          type: "attachSelectedDon",
                          target: { type: "self" },
                        },
                      },
                    ],
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
      "composition:optionalCostedEffect",
      "cost:moveCards",
      "zone:life",
      "destination:hand",
      "instruction:modifyPower",
      "instruction:attachDon",
      "target:thisCharacter",
    ]),
  );
});

it("parses continuous self power gain scaled by cards in hand", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] [Your Turn] This Character gains +1000 power for every card in your hand.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      condition: {
        type: "and",
        conditions: [{ type: "attachedDonCount" }, { type: "yourTurn" }],
      },
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: {
          type: "countMatchingZoneCards",
          player: "self",
          zone: "hand",
          per: 1,
          multiplier: 1000,
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "marker:attachedDon",
      "condition:yourTurn",
      "instruction:modifyPower",
      "target:thisCharacter",
      "value:dynamic:matchingZoneCards",
      "zone:hand",
    ]),
  );
});

it("parses Main leader power gain scaled by matching field Characters", () => {
  const result = parseCardEffectLine(
    "[Main] Your Leader gains +1000 power for each of your Characters during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "main" },
      effect: {
        type: "modifyPower",
        target: { type: "myLeader" },
        value: {
          type: "countMatchingFieldCards",
          player: "self",
          zone: "characterArea",
          filter: { categories: ["character"] },
          multiplier: 1000,
        },
        duration: { type: "thisTurn" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventMain",
      "instruction:modifyPower",
      "target:yourLeader",
      "valueSource:fieldCount",
      "zone:characterArea",
      "filter:category:character",
      "duration:thisTurn",
    ]),
  );
});

it("parses optional On K.O. source card return to hand", () => {
  const result = parseCardEffectLine(
    "[On K.O.] You may add this Character card to your hand.",
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
            optional: true,
            effect: {
              type: "moveCards",
              count: 1,
              from: {
                player: "self",
                zone: "trash",
                source: "effectSource",
              },
              to: { player: "self", zone: "hand" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onKO",
      "composition:optionalActionEffect",
      "instruction:moveCards",
      "target:thisCharacter",
      "zone:trash",
      "destination:hand",
      "sourcePresence:resolveFromDestination",
    ]),
  );
});

it("parses opponent hand-count gated opponent Life area to hand", () => {
  const result = parseCardEffectLine(
    "[On Play] If your opponent has 6 or more cards in their hand, your opponent adds 1 card from their Life area to their hand.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      condition: {
        type: "handCount",
        player: "opponent",
        op: "gte",
        value: 6,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "life",
              player: "opponent",
              chooser: "opponent",
              min: 1,
              max: 1,
              visibility: "chooserOnly",
            },
          },
          {
            connector: "ifPossible",
            effect: {
              type: "moveSelected",
              from: "life",
              to: "hand",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "condition:handCount",
      "player:opponent",
      "instruction:selectCards",
      "instruction:moveSelected",
      "zone:life",
      "destination:hand",
      "chooser:opponent",
      "composition:selectThenMove",
    ]),
  );
});

it("parses optional hand trash cost before opponent-selected owner deck bottom placement", () => {
  const result = parseCardEffectLine(
    "[On Play] You may trash 2 cards from your hand: Your opponent places 1 of their Characters at the bottom of the owner's deck.",
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
              cost: {
                type: "trashFromHand",
                count: 2,
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
                      chooser: "opponent",
                      player: "opponent",
                      zone: "characterArea",
                      min: 1,
                      max: 1,
                      filter: { categories: ["character"] },
                    },
                  },
                },
                {
                  effect: {
                    type: "bounce",
                    destination: "deckBottom",
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
      "instruction:moveSelected",
      "cardinality:exact",
      "chooser:opponent",
      "target:opponentCharacters",
      "destination:deck",
      "position:bottom",
      "composition:selectThenApply",
    ]),
  );
});
