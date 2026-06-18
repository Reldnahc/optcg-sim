import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses field-to-Life cost into next-turn power gain", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] [Activate: Main] [Once Per Turn] You may add 1 of your Characters with a cost of 3 or more and 7000 power or more to the top of your Life cards face-up: Up to 1 of your Characters gains +2000 power until the start of your next turn.",
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
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "moveFieldToLife",
                count: 1,
                chooser: "self",
                player: "self",
                filter: {
                  categories: ["character"],
                  cost: { min: 3 },
                  currentPower: { min: 7000 },
                },
                position: "top",
                faceUp: true,
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              duration: { type: "untilStartOfNextTurn" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "marker:attachedDon",
      "marker:oncePerTurn",
      "cost:moveFieldToLife",
      "target:yourCharacters",
      "filter:cost",
      "filter:currentPower",
      "destination:life",
      "position:top",
      "destination:faceUp",
      "instruction:modifyPower",
      "duration:selfNextTurnStart",
      "composition:costedEffect",
    ]),
  );
});

it("parses end-of-turn face-up Life trash as a reusable matching Life movement", () => {
  const result = parseCardEffectLine(
    "[End of Your Turn] Trash all your face-up Life cards.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "endOfYourTurn" },
      effect: {
        type: "moveMatchingLifeCards",
        player: "self",
        matcher: { faceUp: true },
        to: { player: "self", zone: "trash" },
        order: "original",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:endOfYourTurn",
      "instruction:moveCards",
      "cardinality:all",
      "player:self",
      "zone:life",
      "visibility:faceUp",
      "destination:trash",
      "order:original",
    ]),
  );
});

it("parses face-up Life add-to-hand rules replacement as a permanent replacement primitive", () => {
  const result = parseCardEffectLine(
    "Your face-up Life cards are placed at the bottom of your deck instead of being added to your hand, according to the rules.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "grantReplacement",
        duration: { type: "permanent" },
        replacement: {
          type: "replacement",
          when: {
            type: "wouldMoveZone",
            from: "life",
            to: "hand",
            lifeMatcher: { faceUp: true },
            target: { type: "all", zone: "life", player: "self" },
          },
          instead: {
            type: "bounce",
            target: { type: "replacementTarget" },
            destination: "deckBottom",
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "instruction:grantReplacement",
      "replacement:wouldMoveZone",
      "zone:life",
      "visibility:faceUp",
      "destination:hand",
      "destination:deck",
      "position:bottom",
      "target:replacementTarget",
      "duration:permanent",
    ]),
  );
});

it("parses Counter power followed by private Life reorder", () => {
  const result = parseCardEffectLine(
    "[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, look at all your Life cards and place them back in your Life area in any order.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "counter" },
      sourcePresencePolicy: "resolveFromDestinationZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "modifyPower",
              target: { type: "chooseFromZones" },
              value: 4000,
              duration: { type: "thisBattle" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "reorderLife",
              player: "self",
              viewer: "self",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventCounter",
      "instruction:modifyPower",
      "target:yourLeaderOrCharacters",
      "duration:thisBattle",
      "instruction:reorder",
      "zone:life",
      "visibility:private",
      "order:anyOrder",
      "expression:sequence",
      "composition:entryExpression",
    ]),
  );
});

it("parses top-or-bottom Life trash cost before opponent Character K.O.", () => {
  const result = parseCardEffectLine(
    "[On Play] You may trash 1 card from the top or bottom of your Life cards: K.O. up to 1 of your opponent's Characters with a cost of 5 or less.",
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
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 1,
                chooser: "self",
                from: {
                  player: "self",
                  zone: "life",
                  position: "topOrBottom",
                },
                to: { player: "self", zone: "trash" },
                order: "chooserChoice",
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
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      max: 1,
                      filter: { categories: ["character"], cost: { max: 5 } },
                    },
                  },
                },
                { connector: "then", effect: { type: "ko" } },
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
      "zone:life",
      "position:top",
      "position:bottom",
      "destination:trash",
      "instruction:ko",
      "target:opponentCharacters",
      "filter:cost",
      "composition:optionalCostedEffect",
    ]),
  );
});

it("parses top-or-bottom Life trash cost before revealed hand-to-Life placement", () => {
  const result = parseCardEffectLine(
    "[On Play] You may trash 1 card from the top or bottom of your Life cards: Reveal up to 1 Character card with a cost of 5 from your hand and add it to the top of your Life cards face-down.",
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
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                from: {
                  player: "self",
                  zone: "life",
                  position: "topOrBottom",
                },
                to: { player: "self", zone: "trash" },
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
                    filter: {
                      categories: ["character"],
                      cost: { op: "eq", value: 5 },
                    },
                    visibility: "bothPlayers",
                  },
                },
                {
                  connector: "ifPossible",
                  effect: {
                    type: "moveSelected",
                    from: "hand",
                    to: "life",
                    position: "top",
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
      "cost:moveCards",
      "zone:life",
      "position:top",
      "position:bottom",
      "destination:trash",
      "instruction:selectCards",
      "instruction:moveSelected",
      "zone:hand",
      "destination:life",
      "reveal:bothPlayers",
      "filter:category:character",
      "filter:cost",
      "composition:optionalCostedEffect",
    ]),
  );
});

it("parses up-to-one-each named hand play as independent reusable play selections", () => {
  const result = parseCardEffectLine(
    "[On Play] Play up to 1 each of [Sabo], [Portgas.D.Ace], and [Monkey.D.Luffy] with a cost of 2 from your hand.",
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
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "hand",
                    filter: { names: ["Sabo"], cost: { op: "eq", value: 2 } },
                  },
                },
                { effect: { type: "playSelected", ignoreCost: true } },
              ],
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
                    zone: "hand",
                    filter: {
                      names: ["Portgas.D.Ace"],
                      cost: { op: "eq", value: 2 },
                    },
                  },
                },
                { effect: { type: "playSelected", ignoreCost: true } },
              ],
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
                    zone: "hand",
                    filter: {
                      names: ["Monkey.D.Luffy"],
                      cost: { op: "eq", value: 2 },
                    },
                  },
                },
                { effect: { type: "playSelected", ignoreCost: true } },
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
      "instruction:playSelected",
      "expression:sequence",
      "cardinality:upTo",
      "zone:hand",
      "filter:name",
      "filter:cost",
      "composition:selectThenPlay",
    ]),
  );
});

it("parses Life deck-top extraction as a reusable private Life reorder primitive", () => {
  const result = parseCardEffectLine(
    "[On Play] Look at all your Life cards; place 1 at the top of your deck and place the rest back in your Life area in any order.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "moveLifeToDeckTopAndReorderRest",
        player: "self",
        viewer: "self",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:reorder",
      "instruction:moveCards",
      "player:self",
      "zone:life",
      "destination:deck",
      "position:top",
      "visibility:private",
      "order:anyOrder",
    ]),
  );
});

it("parses Life reveal named play with if-you-do Leader power continuation", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may trash this Character: Reveal 1 card from the top of your Life cards. If that card is a [Sabo] with a cost of 5, you may play that card. If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.",
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
              cost: { type: "trashSelf", optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                { effect: { type: "revealTop", zone: "life" } },
                {
                  effect: {
                    type: "selectFromSet",
                    filter: { names: ["Sabo"], cost: { op: "eq", value: 5 } },
                  },
                },
                {
                  connector: "ifPreviousSucceeded",
                  effect: {
                    type: "sequence",
                    effects: [
                      { effect: { type: "playSelected", ignoreCost: true } },
                      {
                        connector: "ifPreviousSucceeded",
                        effect: {
                          type: "modifyPower",
                          value: 2000,
                          duration: { type: "untilEndOfNextTurn" },
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
      "entry:activateMain",
      "cost:trashSelf",
      "instruction:revealTop",
      "zone:life",
      "instruction:selectFromSet",
      "filter:name",
      "filter:cost",
      "instruction:playSelected",
      "instruction:modifyPower",
      "duration:opponentNextEndPhase",
      "composition:optionalCostedEffect",
    ]),
  );
});

it("parses arbitrary face-up Life face-down cost before conditional opponent Life trash", () => {
  const result = parseCardEffectLine(
    "[On Play] You may turn 1 of your face-up Life cards face-down: If your opponent has 7 or more cards in their hand, trash up to 1 card from the top of your opponent's Life cards.",
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
                type: "setLifeFaceUp",
                count: 1,
                player: "self",
                position: "anyMatching",
                faceUp: false,
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "handCount",
                player: "opponent",
                op: "gte",
                value: 7,
              },
              then: {
                type: "moveCards",
                min: 0,
                count: 1,
                from: {
                  player: "opponent",
                  zone: "life",
                  position: "top",
                },
                to: { player: "opponent", zone: "trash" },
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "cost:setLifeFaceUp",
      "visibility:faceUp",
      "destination:faceDown",
      "condition:handCount",
      "player:opponent",
      "instruction:moveCards",
      "zone:life",
      "destination:trash",
      "composition:optionalCostedEffect",
    ]),
  );
});

it("parses zero-Life conditional hand-or-trash Character placement to face-up Life", () => {
  const result = parseCardEffectLine(
    "[DON!! x2] [Activate: Main] [Once Per Turn] You may trash 1 card from your hand: If you have 0 Life cards, add up to 2 Character cards with a cost of 5 from your hand or trash to the top of your Life cards face-up.",
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
        value: 2,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: {
                type: "trashFromHand",
                chooser: "self",
                count: 1,
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "lifeCount",
                player: "self",
                op: "eq",
                value: 0,
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectCards",
                      zones: ["hand", "trash"],
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 2,
                      filter: {
                        categories: ["character"],
                        cost: { op: "eq", value: 5 },
                      },
                    },
                  },
                  {
                    effect: {
                      type: "moveSelected",
                      from: "currentZone",
                      to: "life",
                      position: "top",
                      destinationFaceUp: true,
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "marker:attachedDon",
      "marker:oncePerTurn",
      "cost:trashFromHand",
      "condition:lifeCount",
      "instruction:selectCards",
      "instruction:moveSelected",
      "zone:hand",
      "zone:trash",
      "destination:life",
      "destination:faceUp",
      "filter:category:character",
      "filter:cost",
      "composition:optionalCostedEffect",
    ]),
  );
});
