import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses comma-separated return-DON plus hand-trash costs into one optional cost sequence", () => {
  expect(
    parseCardEffectLine(
      "[On Play] DON!! -2, You may trash 1 card from your hand: Draw 2 cards.",
    ),
  ).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "sequence",
                optional: true,
                costs: [
                  { type: "returnDon", count: 2 },
                  { type: "trashFromHand", count: 1, chooser: "self" },
                ],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", player: "self", count: 2 },
          },
        ],
      },
    },
    evidence: [
      "entry:onPlay",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:returnDon",
      "count:positiveInteger",
      "cost:trashFromHand",
      "count:positiveInteger",
      "chooser:self",
      "instruction:draw",
      "count:positiveInteger",
      "player:self",
      "composition:entryExpression",
    ],
  });
});

it("parses active leader power reduction as an optional cost before draw", () => {
  expect(
    parseCardEffectLine(
      "[On Play] You may give your active Leader -5000 power during this turn: Draw 1 card.",
    ),
  ).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "modifyPower",
                target: { type: "myLeader" },
                requiredState: "active",
                value: -5000,
                duration: { type: "thisTurn" },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
    evidence: [
      "entry:onPlay",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "cost:modifyPower",
      "target:yourLeader",
      "state:active",
      "modifier:negativePower",
      "duration:thisTurn",
      "instruction:draw",
      "count:positiveInteger",
      "player:self",
      "composition:entryExpression",
    ],
  });
});

it("parses generic own field-card rest as an optional cost before Counter power", () => {
  expect(
    parseCardEffectLine(
      "[Counter] You may rest 1 of your cards: Up to 1 of your Leader or Character cards gains +4000 power during this battle.",
    ),
  ).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "counter" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "restFromField",
                count: 1,
                chooser: "self",
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              value: 4000,
              duration: { type: "thisBattle" },
            },
          },
        ],
      },
    },
    evidence: [
      "entry:eventCounter",
      "sourcePresence:resolveFromDestination",
      "composition:optionalCostedEffect",
      "cost:restFromField",
      "cardinality:exact",
      "count:positiveInteger",
      "chooser:self",
      "player:self",
      "filter:any",
      "instruction:modifyPower",
      "cardinality:upTo",
      "count:positiveInteger",
      "chooser:self:upTo",
      "target:yourLeaderOrCharacters",
      "player:self",
      "filter:category:leader",
      "filter:category:character",
      "modifier:positivePower",
      "duration:thisBattle",
      "composition:entryExpression",
    ],
  });
});

it("parses filtered own field-card rest before an unrelated Main body", () => {
  expect(
    parseCardEffectLine(
      "[Main] You may rest 2 of your {Straw Hat Crew} type Characters: Draw 1 card.",
    ),
  ).toMatchObject({
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
                type: "restFromField",
                count: 2,
                chooser: "self",
                filter: {
                  categories: ["character"],
                  typesAny: ["Straw Hat Crew"],
                },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
  });
});

it("parses filtered own field-card K.O. as an optional cost before an unrelated body", () => {
  expect(
    parseCardEffectLine(
      "[On Play] You may K.O. 1 of your {Baroque Works} type Characters: Draw 1 card.",
    ),
  ).toMatchObject({
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
                type: "koFromField",
                count: 1,
                chooser: "self",
                filter: {
                  categories: ["character"],
                  typesAny: ["Baroque Works"],
                },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
    evidence: [
      "entry:onPlay",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "cost:koFromField",
      "cardinality:exact",
      "count:positiveInteger",
      "chooser:self",
      "player:self",
      "zone:characterArea",
      "filter:type",
      "filter:category:character",
      "instruction:draw",
      "count:positiveInteger",
      "player:self",
      "composition:entryExpression",
    ],
  });
});

it("parses filtered own field-card K.O. cost before an Activate Main all-field body", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] You may K.O. 1 of your {Thriller Bark Pirates} type Characters: Your Leader and all of your Characters gain +1000 power during this turn.",
    ),
  ).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "koFromField",
                count: 1,
                chooser: "self",
                filter: {
                  categories: ["character"],
                  typesAny: ["Thriller Bark Pirates"],
                },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
            },
          },
        ],
      },
    },
    evidence: [
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "marker:oncePerTurn",
      "composition:optionalCostedEffect",
      "cost:koFromField",
      "cardinality:exact",
      "count:positiveInteger",
      "chooser:self",
      "player:self",
      "zone:characterArea",
      "filter:type",
      "filter:category:character",
      "instruction:modifyPower",
      "target:yourLeader",
      "cardinality:all",
      "player:self",
      "zone:characterArea",
      "filter:category:character",
      "modifier:positivePower",
      "duration:thisTurn",
      "composition:entryExpression",
    ],
  });
});

it("parses own field-card K.O. cost with type-including filter before a composed body", () => {
  expect(
    parseCardEffectLine(
      '[Activate: Main] [Once Per Turn] You may K.O. 1 of your Characters with a type including "Baroque Works": Give up to 1 of your opponent\'s Characters −10 cost during this turn. Then, you may trash 2 cards from the top of your deck.',
    ),
  ).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "koFromField",
                count: 1,
                chooser: "self",
                filter: {
                  categories: ["character"],
                  typesIncludeAny: ["Baroque Works"],
                },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
            },
          },
        ],
      },
    },
    evidence: [
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "marker:oncePerTurn",
      "composition:optionalCostedEffect",
      "cost:koFromField",
      "cardinality:exact",
      "count:positiveInteger",
      "chooser:self",
      "player:self",
      "zone:characterArea",
      "filter:category:character",
      "filter:type",
      "expression:sequence",
      "instruction:modifyCost",
      "cardinality:upTo",
      "count:positiveInteger",
      "chooser:self:upTo",
      "player:opponent",
      "target:opponentCharacters",
      "filter:category:character",
      "modifier:costReduction",
      "count:positiveInteger",
      "duration:thisTurn",
      "connector:then",
      "composition:optionalActionEffect",
      "instruction:moveCards",
      "count:positiveInteger",
      "player:self",
      "zone:deck",
      "position:top",
      "destination:trash",
      "order:original",
      "composition:entryExpression",
    ],
  });
});

it("parses explicit active DON return as a reusable optional cost before draw", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] You may return 8 of your active DON!! cards to your DON!! deck: Draw 1 card.",
    ),
  ).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "returnDon",
                count: 8,
                sourceState: "active",
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
    evidence: [
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "cost:returnDon",
      "count:positiveInteger",
      "state:active",
      "instruction:draw",
      "count:positiveInteger",
      "player:self",
      "composition:entryExpression",
    ],
  });
});

it("composes active DON return with multi-card hand play using existing body primitives", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] You may return 8 of your active DON!! cards to your DON!! deck: Play up to 3 {Admiral} type Character cards with different card names from your hand.",
    ),
  ).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "returnDon",
                count: 8,
                sourceState: "active",
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
                    type: "selectCards",
                    zone: "hand",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 3,
                    filter: {
                      categories: ["character"],
                      typesAny: ["Admiral"],
                      custom: "differentNames",
                    },
                    visibility: "chooserOnly",
                  },
                },
                {
                  connector: "ifPossible",
                  effect: {
                    type: "playSelected",
                    ignoreCost: true,
                  },
                },
              ],
            },
          },
        ],
      },
    },
    evidence: [
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "cost:returnDon",
      "count:positiveInteger",
      "state:active",
      "instruction:playSelected",
      "cardinality:upTo",
      "count:positiveInteger",
      "zone:hand",
      "player:self",
      "chooser:self:upTo",
      "filter:type",
      "filter:category:character",
      "filter:differentNames",
      "composition:selectThenPlay",
      "composition:entryExpression",
    ],
  });
});

it("parses deck-top trash as a reusable move-cards cost before draw", () => {
  expect(
    parseCardEffectLine(
      "[On Play] You may trash 1 card from the top of your deck: Draw 1 card.",
    ),
  ).toMatchObject({
    block: {
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
                from: { player: "self", zone: "deck", position: "top" },
                to: { player: "self", zone: "trash" },
                order: "chooserChoice",
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
    evidence: [
      "entry:onPlay",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "cost:moveCards",
      "cardinality:exact",
      "count:positiveInteger",
      "player:self",
      "zone:deck",
      "position:top",
      "destination:trash",
      "order:original",
      "instruction:draw",
      "count:positiveInteger",
      "player:self",
      "composition:entryExpression",
    ],
  });
});

it("parses filtered trash-to-bottom cost without binding the filter to one body", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] You may place 2 cards with a cost of 3 to 5 from your trash at the bottom of your deck in any order: Draw 1 card.",
    ),
  ).toMatchObject({
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
                count: 2,
                from: { player: "self", zone: "trash" },
                to: { player: "self", zone: "deck", position: "bottom" },
                filter: {
                  cost: { min: 3, max: 5 },
                },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
  });
});

it("parses quoted type-including trash-to-bottom costs as substring type filters", () => {
  expect(
    parseCardEffectLine(
      '[On Play] You may place 3 cards with a type including "CP" from your trash at the bottom of your deck in any order: Draw 1 card.',
    ),
  ).toMatchObject({
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
                count: 3,
                from: { player: "self", zone: "trash" },
                to: { player: "self", zone: "deck", position: "bottom" },
                filter: {
                  typesIncludeAny: ["CP"],
                },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
  });
});

it("parses active DON attachment and trash-self as reusable optional cost sequence", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] You may give 1 of your active DON!! cards to 1 of your Leader or Character cards and trash this Character: Give up to 1 of your opponent's Characters -3000 power during this turn.",
    ),
  ).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "sequence",
                optional: true,
                costs: [
                  {
                    type: "attachDon",
                    count: 1,
                    sourceState: "active",
                    target: {
                      type: "chooseFromZones",
                      request: {
                        timing: "onResolution",
                        chooser: "self",
                        player: "self",
                        zones: ["leaderArea", "characterArea"],
                        min: 1,
                        max: 1,
                        allowFewerIfUnavailable: false,
                        visibility: "public",
                        filter: { categories: ["leader", "character"] },
                      },
                    },
                  },
                  { type: "trashSelf" },
                ],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              target: {
                type: "choose",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "opponent",
                  zone: "characterArea",
                  min: 0,
                  max: 1,
                  allowFewerIfUnavailable: true,
                  visibility: "public",
                  filter: { categories: ["character"] },
                },
              },
              value: -3000,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
    evidence: [
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:attachDon",
      "cardinality:exact",
      "count:positiveInteger",
      "state:active",
      "target:yourDonCards",
      "target:yourLeaderOrCharacters",
      "player:self",
      "filter:category:leader",
      "filter:category:character",
      "cost:trashSelf",
      "target:thisCharacter",
      "instruction:modifyPower",
      "cardinality:upTo",
      "count:positiveInteger",
      "chooser:self:upTo",
      "player:opponent",
      "target:opponentCharacters",
      "filter:category:character",
      "modifier:negativePower",
      "duration:thisTurn",
      "composition:entryExpression",
    ],
  });
});

it("parses return-DON cost into temporary keyword grant then hand-trash sequence", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] DON!! -1: This Character gains [Blocker] until the end of your opponent's next End Phase. Then, trash 1 card from your hand.",
    ),
  ).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      sourcePresencePolicy: "mustRemainInSameZone",
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
                    type: "giveKeyword",
                    target: { type: "self" },
                    keyword: "blocker",
                    duration: {
                      type: "untilEndOfNextTurn",
                      player: "opponent",
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "trashFromHand",
                    count: 1,
                    player: "self",
                    chooser: "self",
                  },
                },
              ],
            },
          },
        ],
      },
    },
    evidence: [
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "composition:costedEffect",
      "cost:returnDon",
      "count:positiveInteger",
      "expression:sequence",
      "instruction:giveKeyword",
      "target:thisCharacter",
      "keyword:anySupported",
      "duration:opponentNextEndPhase",
      "connector:then",
      "instruction:trashFromHand",
      "count:positiveInteger",
      "player:self",
      "chooser:self",
      "composition:entryExpression",
    ],
  });
});
