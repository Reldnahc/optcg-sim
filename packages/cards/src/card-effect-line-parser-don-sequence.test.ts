import { expect, it } from "vitest";

import {
  parseCardEffectLine,
  parseCardEffectLineDetailed,
} from "./card-effect-line-parser.js";

it("parses DON deck-size rules text as legality metadata without a runtime block", () => {
  const result = parseCardEffectLineDetailed(
    "Under the rules of this game, your DON!! deck consists of 6 cards.",
  );

  expect(result).toEqual({
    ok: true,
    value: {
      kind: "metadata",
      metadata: {
        type: "deckRestriction",
        restriction: {
          type: "donDeckSize",
          count: 6,
        },
      },
      evidence: [
        "deckRestriction:ignored",
        "deckRestriction:donDeckSize",
        "filter:category:don",
        "zone:donDeck",
        "count:positiveInteger",
      ],
    },
  });
});

it("parses any-copy deck rules text as legality metadata without a runtime block", () => {
  const result = parseCardEffectLineDetailed(
    "Under the rules of this game, you may have any number of this card in your deck.",
  );

  expect(result).toEqual({
    ok: true,
    value: {
      kind: "metadata",
      metadata: {
        type: "deckRestriction",
        restriction: {
          type: "anyCopiesOfThisCard",
        },
      },
      evidence: [
        "deckRestriction:ignored",
        "deckRestriction:anyCopiesOfThisCard",
        "target:thisCard",
        "zone:deck",
      ],
    },
  });
});

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

it("parses activate-main hand-to-deck-top cost into rested-DON leader-or-character attachment", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] You may place 1 card from your hand at the top of your deck: Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.",
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
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 1,
                chooser: "self",
                from: { player: "self", zone: "hand" },
                to: { player: "self", zone: "deck", position: "top" },
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
                  saveResultAs: "donSelection:attach",
                  effect: {
                    type: "selectCards",
                    zone: "costArea",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 2,
                    filter: { categories: ["don"], state: "rested" },
                    saveAs: "donSelection:attach",
                    visibility: "bothPlayers",
                  },
                },
                {
                  connector: "ifYouDo",
                  saveResultAs: "targetSelection:attach-don",
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      zones: ["leaderArea", "characterArea"],
                      player: "self",
                      filter: { categories: ["leader", "character"] },
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
                      zones: ["leaderArea", "characterArea"],
                      player: "self",
                      filter: { categories: ["leader", "character"] },
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
      "composition:optionalCostedEffect",
      "cost:moveCards",
      "zone:hand",
      "destination:deck",
      "position:top",
      "instruction:selectCards",
      "instruction:attachDon",
      "zone:leaderArea",
      "zone:characterArea",
      "filter:category:leader",
      "filter:category:character",
      "filter:state:rested",
      "composition:selectThenApply",
    ]),
  );
});

it("parses rested DON attachment to generic bracket-name card targets", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to 1 of your [Nami] cards.",
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
              zone: "costArea",
              filter: { categories: ["don"], state: "rested" },
            },
          },
          {
            effect: {
              type: "selectTargets",
              request: {
                zones: ["leaderArea", "characterArea"],
                filter: {
                  categories: ["leader", "character"],
                  names: ["Nami"],
                },
              },
            },
          },
          {
            effect: { type: "attachSelectedDon" },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "filter:name",
      "filter:category:leader",
      "filter:category:character",
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
              filter: { categories: ["character"], cost: { min: 7 } },
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
            saveResultAs: "paidCost",
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
