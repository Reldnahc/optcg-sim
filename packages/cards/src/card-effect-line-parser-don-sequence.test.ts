import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses activate-main turn-count DON ramp and rested-DON attach compositionally", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] If it is your second turn or later, add up to 1 DON!! card from your DON!! deck and set it as active, and add up to 4 additional DON!! cards and rest them. Then, give up to 4 rested DON!! cards to 1 of your Characters.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      sourcePresencePolicy: "mustRemainInSameZone",
      condition: {
        type: "turnCount",
        player: "self",
        op: "gte",
        value: 2,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "moveCards",
                    min: 0,
                    count: 1,
                    from: {
                      player: "self",
                      zone: "donDeck",
                      position: "top",
                    },
                    to: { player: "self", zone: "costArea" },
                    order: "original",
                    destinationState: "active",
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "moveCards",
                    min: 0,
                    count: 4,
                    from: {
                      player: "self",
                      zone: "donDeck",
                      position: "top",
                    },
                    to: { player: "self", zone: "costArea" },
                    order: "original",
                    destinationState: "rested",
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  saveResultAs: "donSelection:attach",
                  saveResultKinds: ["selectedCards:don"],
                  effect: {
                    type: "selectCards",
                    zone: "costArea",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 4,
                    filter: { categories: ["don"], state: "rested" },
                    saveAs: "donSelection:attach",
                    visibility: "bothPlayers",
                  },
                },
                {
                  connector: "ifYouDo",
                  saveResultAs: "targetSelection:attach-don",
                  saveResultKinds: ["selectedTargets"],
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      zone: "characterArea",
                      player: "self",
                      filter: { categories: ["character"] },
                      min: 1,
                      max: 1,
                      allowFewerIfUnavailable: false,
                      visibility: "public",
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "attachSelectedDon",
                    selection: "donSelection:attach",
                    target: {
                      type: "savedFieldObject",
                      binding: {
                        family: "selectedTargets",
                        saveResultAs: "targetSelection:attach-don",
                      },
                      zone: "characterArea",
                      player: "self",
                      filter: { categories: ["character"] },
                      visibility: "publicOnly",
                      onFailure: "failClosed",
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
      "marker:oncePerTurn",
      "condition:turnCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "instruction:moveCards",
      "zone:donDeck",
      "destination:costArea",
      "state:active",
      "state:rested",
      "instruction:selectCards",
      "instruction:attachDon",
      "filter:category:don",
      "filter:category:character",
      "filter:state:rested",
      "composition:selectThenApply",
    ]),
  );
});

it("parses activate-main DON activation followed by character-effect DON activation restriction", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] Set up to 1 of your DON!! cards as active. Then, you cannot set DON!! cards as active using Character effects during this turn.",
  );

  expect(result).toMatchObject({
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
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      zone: "costArea",
                      player: "self",
                      min: 0,
                      max: 1,
                      filter: { categories: ["don"], state: "rested" },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "activate",
                    target: { type: "savedFieldObject" },
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "preventDonActivation",
              player: "self",
              sourceCategories: ["character"],
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
      "instruction:activate",
      "instruction:preventDonActivation",
      "target:yourDonCards",
      "filter:category:don",
      "sourceCategory:character",
      "duration:thisTurn",
      "composition:selectThenApply",
    ]),
  );
});

it("parses on-play DON activation followed by filtered play restriction", () => {
  const result = parseCardEffectLine(
    "[On Play] Set up to 4 of your DON!! cards as active. Then, you cannot play Character cards with a base cost of 7 or more during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      zone: "costArea",
                      player: "self",
                      min: 0,
                      max: 4,
                      filter: { categories: ["don"], state: "rested" },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "activate",
                    target: { type: "savedFieldObject" },
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "preventPlay",
              player: "self",
              filter: { categories: ["character"], baseCost: { min: 7 } },
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:activate",
      "instruction:preventPlay",
      "target:yourDonCards",
      "filter:category:don",
      "filter:category:character",
      "filter:cost",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "duration:thisTurn",
      "composition:selectThenApply",
    ]),
  );
});

it("parses all-DON activation followed by generic hand play restriction", () => {
  const result = parseCardEffectLine(
    "[On Play] Set all of your DON!! cards as active. Then, you cannot play cards from your hand during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "activate",
              target: {
                type: "all",
                player: "self",
                zone: "costArea",
                filter: { categories: ["don"], state: "rested" },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "preventPlay",
              player: "self",
              filter: {},
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:activate",
      "instruction:preventPlay",
      "target:yourDonCards",
      "cardinality:all",
      "zone:costArea",
      "filter:category:don",
      "filter:state:rested",
      "state:active",
      "zone:hand",
      "duration:thisTurn",
    ]),
  );
});

it("parses delayed end-of-turn DON activation as timing around reusable activation body", () => {
  const result = parseCardEffectLine(
    "[On Play] Set up to 5 of your DON!! cards as active at the end of this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "delayed",
        timing: { type: "endOfTurn", turn: "current" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "selectTargets",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  zone: "costArea",
                  player: "self",
                  min: 0,
                  max: 5,
                  filter: { categories: ["don"], state: "rested" },
                },
              },
            },
            {
              connector: "then",
              effect: {
                type: "activate",
                target: { type: "savedFieldObject" },
              },
            },
          ],
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:activate",
      "target:yourDonCards",
      "filter:category:don",
      "filter:state:rested",
      "state:active",
      "duration:endOfTurn",
      "composition:delayed",
      "composition:selectThenApply",
    ]),
  );
});

it("parses delayed DON activation body under another entry point", () => {
  const result = parseCardEffectLine(
    "[When Attacking] Set up to 2 of your DON!! cards as active at the end of this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "whenAttacking" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "delayed",
        timing: { type: "endOfTurn", turn: "current" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectTargets",
                request: { max: 2 },
              },
            },
            {
              effect: {
                type: "activate",
                target: { type: "savedFieldObject" },
              },
            },
          ],
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:whenAttacking",
      "duration:endOfTurn",
      "composition:delayed",
    ]),
  );
});

it("parses opponent rested-DON cost and owner-relative DON attachment body separately", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] You may give 1 of your opponent's rested DON!! cards to 1 of your opponent's Characters: Give up to 1 DON!! card from its owner's cost area to its owner's Leader or 1 of their Characters.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "attachDon",
                count: 1,
                sourcePlayer: "opponent",
                sourceState: "rested",
                target: {
                  type: "choose",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "opponent",
                    zone: "characterArea",
                    min: 1,
                    max: 1,
                    filter: { categories: ["character"] },
                  },
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
                  saveResultKinds: ["selectedTargets", "selectedCards:don"],
                  effect: {
                    type: "selectTargets",
                    request: {
                      chooser: "self",
                      player: "anyPlayer",
                      zone: "costArea",
                      min: 0,
                      max: 1,
                      filter: { categories: ["don"] },
                    },
                  },
                },
                {
                  saveResultKinds: ["selectedTargets"],
                  effect: {
                    type: "selectTargets",
                    request: {
                      chooser: "self",
                      player: "anyPlayer",
                      zones: ["leaderArea", "characterArea"],
                      min: 1,
                      max: 1,
                      filter: { categories: ["leader", "character"] },
                    },
                  },
                },
                {
                  effect: {
                    type: "attachSelectedDon",
                    targetOwner: "selectedDonOwner",
                    target: { type: "savedFieldObject", player: "anyPlayer" },
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
      "cost:attachDon",
      "instruction:attachDon",
      "player:opponent",
      "reference:ownerOfSelected",
      "composition:selectThenApply",
    ]),
  );
});

it("parses main rest-DON cost with attached-DON condition and power reduction body", () => {
  const result = parseCardEffectLine(
    "[Main] You may rest 5 of your DON!! cards: If you have any DON!! cards given, give up to 1 of your opponent's Characters −8000 power during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "main" },
      sourcePresencePolicy: "resolveFromDestinationZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost:restDon",
            effect: {
              type: "payCost",
              cost: {
                type: "restDon",
                count: 5,
                chooser: "self",
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "fieldCount",
                player: "self",
                filter: { categories: ["don"], state: "attached" },
                op: "gte",
                value: 1,
              },
              then: {
                type: "modifyPower",
                value: -8000,
                duration: { type: "thisTurn" },
                target: {
                  type: "choose",
                  request: {
                    chooser: "self",
                    player: "opponent",
                    zone: "characterArea",
                    min: 0,
                    max: 1,
                    filter: { categories: ["character"] },
                  },
                },
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventMain",
      "cost:restDon",
      "condition:donFieldCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "filter:category:don",
      "filter:state:attached",
      "instruction:modifyPower",
      "modifier:negativePower",
      "duration:thisTurn",
      "target:opponentCharacters",
    ]),
  );
});

it("parses conditional when-attacking top-deck top-or-bottom placement", () => {
  const result = parseCardEffectLine(
    "[When Attacking] If you have 6 or less DON!! cards on your field, look at 2 cards from the top of your deck and place them at the top or bottom of your deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "whenAttacking" },
      sourcePresencePolicy: "mustRemainInSameZone",
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"] },
        op: "lte",
        value: 6,
      },
      effect: {
        type: "placeTopDeckCards",
        player: "self",
        count: 2,
        destination: "topOrBottom",
        order: "ownerChoice",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:whenAttacking",
      "condition:donFieldCount",
      "condition:comparator:lte",
      "condition:threshold:positiveInteger",
      "filter:category:don",
      "instruction:placeTopDeckCards",
      "look:topDeck",
      "zone:deck",
      "position:top",
      "position:bottom",
      "order:anyOrder",
    ]),
  );
});

it("parses on-play top-deck top-or-bottom placement before rested-DON attachment", () => {
  const result = parseCardEffectLine(
    "[On Play] Look at 3 cards from the top of your deck and place them at the top or bottom of your deck in any order. Then, give up to 1 rested DON!! card to 1 of your {The Seven Warlords of the Sea} type Leader or Character cards.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "placeTopDeckCards",
              player: "self",
              count: 3,
              destination: "topOrBottom",
              order: "ownerChoice",
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  id: "select:rested-don",
                  connector: "always",
                  saveResultAs: "donSelection:attach",
                  saveResultKinds: ["selectedCards:don"],
                  effect: {
                    type: "selectCards",
                    zone: "costArea",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: { categories: ["don"], state: "rested" },
                    saveAs: "donSelection:attach",
                    visibility: "bothPlayers",
                  },
                },
                {
                  id: "select:don-attach-target",
                  connector: "ifYouDo",
                  saveResultAs: "targetSelection:attach-don",
                  saveResultKinds: ["selectedTargets"],
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      player: "self",
                      zones: ["leaderArea", "characterArea"],
                      filter: {
                        categories: ["leader", "character"],
                        typesAny: ["The Seven Warlords of the Sea"],
                      },
                      min: 1,
                      max: 1,
                      allowFewerIfUnavailable: false,
                      visibility: "public",
                    },
                  },
                },
                {
                  id: "attach:selected-don",
                  connector: "then",
                  effect: {
                    type: "attachSelectedDon",
                    selection: "donSelection:attach",
                    target: {
                      type: "savedFieldObject",
                      binding: {
                        family: "selectedTargets",
                        saveResultAs: "targetSelection:attach-don",
                      },
                      zones: ["leaderArea", "characterArea"],
                      player: "self",
                      filter: {
                        categories: ["leader", "character"],
                        typesAny: ["The Seven Warlords of the Sea"],
                      },
                      visibility: "publicOnly",
                      onFailure: "failClosed",
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
      "entry:onPlay",
      "instruction:placeTopDeckCards",
      "look:topDeck",
      "zone:deck",
      "position:top",
      "position:bottom",
      "order:anyOrder",
      "instruction:selectCards",
      "instruction:attachDon",
      "filter:category:leader",
      "filter:category:character",
      "filter:type",
      "expression:sequence",
    ]),
  );
});

it("parses reveal-from-hand cost into rested-DON distribution to Leader and all Characters", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] You may reveal 3 {Amazon Lily} or {Kuja Pirates} type cards from your hand: Draw 1 card.",
    ),
  ).toBeDefined();
  expect(
    parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] Give your Leader and all of your Characters up to 1 rested DON!! card each.",
    ),
  ).toBeDefined();
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] You may reveal 3 {Amazon Lily} or {Kuja Pirates} type cards from your hand: Give your Leader and all of your Characters up to 1 rested DON!! card each.",
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
                type: "revealFromHand",
                count: 3,
                chooser: "self",
                filter: {
                  typesAny: ["Amazon Lily", "Kuja Pirates"],
                },
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
                  id: "select:distributed-don-attach-targets",
                  connector: "always",
                  saveResultAs: "targetSelection:distributed-attach-don",
                  saveResultKinds: ["selectedTargets"],
                  effect: {
                    type: "selectAllTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      player: "self",
                      zones: ["leaderArea", "characterArea"],
                      filter: { categories: ["leader", "character"] },
                      visibility: "public",
                    },
                  },
                },
                {
                  id: "for-each:distributed-don-attach-target",
                  connector: "then",
                  effect: {
                    type: "forEachSavedTarget",
                    selection: "targetSelection:distributed-attach-don",
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
      "sourcePresence:mustRemain",
      "marker:oncePerTurn",
      "composition:optionalCostedEffect",
      "cost:revealFromHand",
      "filter:type",
      "filter:any",
      "instruction:selectAllTargets",
      "instruction:selectCards",
      "instruction:attachDon",
      "zone:leaderArea",
      "zone:characterArea",
      "filter:category:leader",
      "filter:category:character",
      "composition:forEachSavedTarget",
      "composition:selectThenApply",
    ]),
  );
});

it("parses on-play fixed top-deck placement", () => {
  const result = parseCardEffectLine(
    "[On Play] Look at 3 cards from the top of your deck and place them at the top of your deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "placeTopDeckCards",
        player: "self",
        count: 3,
        destination: "top",
        order: "ownerChoice",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:placeTopDeckCards",
      "look:topDeck",
      "zone:deck",
      "position:top",
      "order:anyOrder",
    ]),
  );
});
