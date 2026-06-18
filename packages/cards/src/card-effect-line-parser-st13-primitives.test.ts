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
