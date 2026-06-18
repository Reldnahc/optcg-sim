import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser move-cards costs", () => {
  it("parses field-to-Life placement as a reusable cost before opponent hand trash", () => {
    const result = parseCardEffectLine(
      "[On Play] Place 1 of your opponent's Characters with a cost of 3 or less at the top or bottom of your opponent's Life cards face-up: Your opponent trashes 1 card from their hand.",
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
                  type: "moveFieldToLife",
                  count: 1,
                  chooser: "self",
                  player: "opponent",
                  filter: { categories: ["character"], cost: { max: 3 } },
                  position: "topOrBottom",
                  faceUp: true,
                  optional: true,
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "trashFromHand",
                player: "opponent",
                chooser: "opponent",
                count: 1,
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:costedEffect",
        "cost:moveFieldToLife",
        "target:opponentCharacters",
        "destination:life",
        "instruction:trashFromHand",
        "player:opponent",
      ]),
    );
  });

  it("parses optional self-trash cost into conditional exact deck top to Life and all Character power sequence", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] You may trash this Character: If your Leader is [Shirahoshi], add 1 card from the top of your deck to the top of your Life cards. Then, all of your {Neptunian} type Characters gain +1000 power during this turn.",
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
              effect: {
                type: "payCost",
                cost: { type: "trashSelf" },
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
                      type: "conditional",
                      if: {
                        type: "hasCardInZone",
                        player: "self",
                        zone: "leaderArea",
                        filter: { names: ["Shirahoshi"] },
                      },
                      then: {
                        type: "moveCards",
                        count: 1,
                        from: {
                          player: "self",
                          zone: "deck",
                          position: "top",
                        },
                        to: {
                          player: "self",
                          zone: "life",
                          position: "top",
                        },
                        order: "original",
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "modifyPower",
                      target: {
                        type: "all",
                        player: "self",
                        zone: "characterArea",
                        filter: {
                          categories: ["character"],
                          typesAny: ["Neptunian"],
                        },
                      },
                      value: 1000,
                      duration: { type: "thisTurn" },
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
        "composition:optionalCostedEffect",
        "cost:trashSelf",
        "condition:leaderIdentity",
        "instruction:moveCards",
        "instruction:modifyPower",
        "filter:type",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses revealed hand selection moved to Life face-down as reusable select-then-move primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] Reveal up to 1 {Supernovas} type Character card from your hand and add it to the top of your Life cards face-down.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectCards",
                zone: "hand",
                player: "self",
                chooser: "self",
                visibility: "bothPlayers",
                filter: {
                  categories: ["character"],
                  typesAny: ["Supernovas"],
                },
              },
            },
            {
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
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:selectCards",
        "instruction:moveSelected",
        "filter:type",
        "filter:category:character",
        "reveal:bothPlayers",
        "destination:life",
        "position:top",
        "composition:selectThenMove",
      ]),
    );
  });

  it("parses optional top-or-bottom Life to hand as a moveCards cost", () => {
    const result = parseCardEffectLine(
      "[On Play] You may add 1 card from the top or bottom of your Life cards to your hand: K.O. up to 1 of your opponent's Characters with a cost of 5 or less.",
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
                  chooser: "self",
                  from: {
                    player: "self",
                    zone: "life",
                    position: "topOrBottom",
                  },
                  to: { player: "self", zone: "hand" },
                  order: "chooserChoice",
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
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "ko",
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
        "position:top",
        "position:bottom",
        "destination:hand",
        "instruction:ko",
      ]),
    );
  });

  it("parses sentence-form optional top-or-bottom Life to hand cost before an if-you-do body", () => {
    const result = parseCardEffectLine(
      "[Main] You may add 1 card from the top or bottom of your Life cards to your hand. If you do, your Leader gains +2000 power until the end of your opponent's next turn.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
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
                  optional: true,
                  from: {
                    player: "self",
                    zone: "life",
                    position: "topOrBottom",
                  },
                  to: { player: "self", zone: "hand" },
                  order: "chooserChoice",
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "modifyPower",
                target: { type: "myLeader" },
                value: 2000,
                duration: { type: "untilEndOfNextTurn", player: "opponent" },
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
        "position:top",
        "position:bottom",
        "instruction:modifyPower",
        "target:yourLeader",
        "duration:opponentNextEndPhase",
      ]),
    );
  });

  it("parses top Life inspection and top-or-bottom placement as a reusable Life placement primitive", () => {
    const result = parseCardEffectLine(
      "[Main] Look at up to 1 card from the top of your or your opponent's Life cards and place it at the top or bottom of the Life cards. Then, K.O. up to 1 of your opponent's Characters with a cost of 5 or less.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "placeTopLifeCard",
                players: ["self", "opponent"],
                viewer: "self",
                position: "topOrBottom",
              },
            },
            {
              connector: "then",
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "opponent",
                        zone: "characterArea",
                        filter: { categories: ["character"], cost: { max: 5 } },
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
        "instruction:lookAt",
        "zone:life",
        "player:self",
        "player:opponent",
        "position:top",
        "position:bottom",
        "instruction:ko",
      ]),
    );
  });

  it("parses optional turn-Life-face-up as its own reusable cost primitive", () => {
    const result = parseCardEffectLine(
      "[On Play] You may turn 1 card from the top of your Life cards face-up: Draw 1 card.",
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
                  type: "turnLifeFaceUp",
                  count: 1,
                  player: "self",
                  position: "top",
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "draw",
                player: "self",
                count: 1,
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:optionalCostedEffect",
        "cost:turnLifeFaceUp",
        "zone:life",
        "position:top",
        "reveal:bothPlayers",
        "instruction:draw",
      ]),
    );
  });

  it("parses plural turn-Life-face-up costs before reusable DON deck movement", () => {
    const result = parseCardEffectLine(
      "[When Attacking] You may turn 2 cards from the top of your Life cards face-up: Add up to 1 DON!! card from your DON!! deck and rest it.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "whenAttacking" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: {
                  type: "turnLifeFaceUp",
                  count: 2,
                  player: "self",
                  position: "top",
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "moveCards",
                min: 0,
                count: 1,
                from: { player: "self", zone: "donDeck", position: "top" },
                to: { player: "self", zone: "costArea" },
                destinationState: "rested",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:whenAttacking",
        "composition:optionalCostedEffect",
        "cost:turnLifeFaceUp",
        "zone:life",
        "position:top",
        "reveal:bothPlayers",
        "instruction:moveCards",
        "zone:donDeck",
        "destination:costArea",
        "state:rested",
      ]),
    );
  });

  it("parses optional Life-to-hand cost before hand-to-Life-top movement", () => {
    const result = parseCardEffectLine(
      "[On Play] You may add 1 card from the top or bottom of your Life cards to your hand: Add up to 1 card from your hand to the top of your Life cards.",
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
                  chooser: "self",
                  from: {
                    player: "self",
                    zone: "life",
                    position: "topOrBottom",
                  },
                  to: { player: "self", zone: "hand" },
                  order: "chooserChoice",
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
                    saveResultAs: "handSelection:self-hand-to-life-placement",
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      saveAs: "handSelection:self-hand-to-life-placement",
                      visibility: "chooserOnly",
                    },
                  },
                  {
                    connector: "ifPossible",
                    effect: {
                      type: "moveSelected",
                      selection: "handSelection:self-hand-to-life-placement",
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
        "composition:optionalCostedEffect",
        "cost:moveCards",
        "zone:life",
        "position:top",
        "position:bottom",
        "destination:hand",
        "instruction:selectCards",
        "instruction:moveSelected",
        "zone:hand",
        "destination:life",
      ]),
    );
  });

  it("parses optional Life-to-hand cost before filtered hand-to-Life face-up movement", () => {
    const result = parseCardEffectLine(
      "[On Play] You may add 1 card from the top or bottom of your Life cards to your hand: Add up to 1 {Supernovas} type Character card with a cost of 5 from your hand to the top of your Life cards face-up.",
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
                  from: {
                    player: "self",
                    zone: "life",
                    position: "topOrBottom",
                  },
                  to: { player: "self", zone: "hand" },
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
                      type: "selectCards",
                      zone: "hand",
                      player: "self",
                      filter: {
                        categories: ["character"],
                        typesAny: ["Supernovas"],
                        cost: { op: "eq", value: 5 },
                      },
                    },
                  },
                  {
                    effect: {
                      type: "moveSelected",
                      from: "hand",
                      to: "life",
                      position: "top",
                      destinationFaceUp: true,
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
        "instruction:selectCards",
        "instruction:moveSelected",
        "zone:hand",
        "destination:life",
        "visibility:faceUp",
        "filter:type",
        "filter:category:character",
        "filter:cost",
      ]),
    );
  });

  it("reuses filtered hand-to-Life face-up movement under Main timing", () => {
    const result = parseCardEffectLine(
      "[Main] You may add 1 card from the top of your Life cards to your hand: Add up to 1 {Example} type card from your hand to the top of your Life cards face-up.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        effect: {
          type: "sequence",
          effects: [
            {},
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      filter: { typesAny: ["Example"] },
                    },
                  },
                  {
                    effect: {
                      type: "moveSelected",
                      from: "hand",
                      to: "life",
                      destinationFaceUp: true,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
  });

  it("parses optional turn-Life-face-down cost before rested DON attachment", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] You may turn 1 card from the top of your Life cards face-down: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.",
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
              effect: {
                type: "payCost",
                cost: {
                  type: "setLifeFaceUp",
                  count: 1,
                  player: "self",
                  position: "top",
                  faceUp: false,
                },
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
        "composition:optionalCostedEffect",
        "cost:setLifeFaceUp",
        "zone:life",
        "position:top",
        "destination:faceDown",
        "instruction:attachDon",
      ]),
    );
  });

  it("parses return-to-owner hand followed by trash-all-hand as reusable sequence primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] Return up to 1 of your opponent's Characters to the owner's hand. Then, trash all cards from your hand.",
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
                type: "sequence",
                effects: [
                  { effect: { type: "selectTargets" } },
                  { effect: { type: "bounce", destination: "hand" } },
                ],
              },
            },
            {
              connector: "then",
              effect: {
                type: "trashFromHandUntilCount",
                player: "self",
                chooser: "self",
                handCount: 0,
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:returnToOwnerHand",
        "instruction:trashFromHandUntilCount",
        "condition:handCount",
        "condition:threshold:nonNegativeInteger",
        "connector:then",
      ]),
    );
  });

  it("parses optional rest plus move-cards cost into opponent hand-count trash", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] You may rest this Character and place 2 cards from your trash at the bottom of your deck in any order: If your opponent has 6 or more cards in their hand, your opponent trashes 1 card from their hand.",
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
              effect: {
                type: "payCost",
                cost: {
                  type: "sequence",
                  optional: true,
                  costs: [
                    { type: "restSelf" },
                    {
                      type: "moveCards",
                      count: 2,
                      chooser: "self",
                      from: { player: "self", zone: "trash" },
                      to: {
                        player: "self",
                        zone: "deck",
                        position: "bottom",
                      },
                      order: "chooserChoice",
                    },
                  ],
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
                  value: 6,
                },
                then: {
                  type: "trashFromHand",
                  player: "opponent",
                  chooser: "opponent",
                  count: 1,
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
        "composition:optionalCostedEffect",
        "composition:costSequence",
        "cost:restSelf",
        "target:thisCharacter",
        "cost:moveCards",
        "zone:trash",
        "destination:deck",
        "order:anyOrder",
        "condition:handCount",
        "condition:comparator:gte",
        "player:opponent",
        "instruction:trashFromHand",
        "chooser:opponent",
      ]),
    );
  });
});
