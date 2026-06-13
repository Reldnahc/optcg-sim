import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser search effects", () => {
  it("parses top-of-deck looked-set play as decomposed play primitives", () => {
    const result = parseCardEffectLine(
      "[Counter] Look at 5 cards from the top of your deck and play up to 1 {Animal} type Character card with a cost of 3 or less. Then, place the rest at the bottom of your deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 5,
                saveAs: "set:look-play",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:look-play",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  typesAny: ["Animal"],
                  cost: { max: 3 },
                },
                saveAs: "revealSelection:play",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "playSelected",
                selection: "revealSelection:play",
                ignoreCost: true,
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:look-play",
                owner: "self",
                destination: "deck",
                position: "bottom",
                order: "chooser",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventCounter",
        "look:topDeck",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:playSelected",
        "instruction:placeSetRemainder",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "remaining:bottomDeck",
      ]),
    );
  });

  it("parses top-of-deck looked-set Life placement as decomposed move primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 3 cards from the top of your deck; add up to 1 card to the top of your Life cards. Then, place the rest at the bottom of your deck in any order.",
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
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 3,
                saveAs: "set:look-play",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:look-play",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {},
                saveAs: "revealSelection:life",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "moveSelected",
                selection: "revealSelection:life",
                from: "set:look-play",
                to: "life",
                position: "top",
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:look-play",
                owner: "self",
                destination: "deck",
                position: "bottom",
                order: "chooser",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "look:topDeck",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:moveSelected",
        "instruction:placeSetRemainder",
        "cardinality:upTo",
        "destination:life",
        "position:top",
        "remaining:bottomDeck",
      ]),
    );
  });

  it("parses revealed filtered looked-set Life placement as public selected move evidence", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Blackbeard Pirates} type card and add it to the top of your Life cards face-up. Then, place the rest at the bottom of your deck in any order.",
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
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 5,
                saveAs: "set:look-play",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:look-play",
                chooser: "self",
                min: 0,
                max: 1,
                filter: { typesAny: ["Blackbeard Pirates"] },
                saveAs: "revealSelection:life",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "revealSelected",
                selection: "revealSelection:life",
                visibility: "bothPlayers",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "moveSelected",
                selection: "revealSelection:life",
                from: "set:look-play",
                to: "life",
                position: "top",
                destinationFaceUp: true,
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:look-play",
                owner: "self",
                destination: "deck",
                position: "bottom",
                order: "chooser",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:revealSelected",
        "instruction:moveSelected",
        "filter:type",
        "reveal:bothPlayers",
        "destination:life",
        "position:top",
        "destination:faceUp",
      ]),
    );
  });

  it("parses hidden filtered looked-set placement to bottom of Life as move data", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 4 cards from the top of your deck; add up to 1 Character card with a cost of 4 or less to the bottom of your Life cards. Then, place the rest at the bottom of your deck in any order.",
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
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 4,
                saveAs: "set:look-play",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:look-play",
                chooser: "self",
                min: 0,
                max: 1,
                filter: { categories: ["character"], cost: { max: 4 } },
                saveAs: "revealSelection:life",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "moveSelected",
                selection: "revealSelection:life",
                from: "set:look-play",
                to: "life",
                position: "bottom",
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:look-play",
                owner: "self",
                destination: "deck",
                position: "bottom",
                order: "chooser",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:moveSelected",
        "filter:category:character",
        "filter:cost",
        "reveal:chooserOnly",
        "destination:life",
        "position:bottom",
      ]),
    );
  });

  it("parses public top-of-deck type search reveal as decomposed looked-set primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
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
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 5,
                saveAs: "set:search-look",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:search-look",
                chooser: "self",
                min: 0,
                max: 1,
                filter: { typesAny: ["Five Elders"] },
                saveAs: "searchSelection:hand",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "revealSelected",
                selection: "searchSelection:hand",
                visibility: "bothPlayers",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "moveSelected",
                selection: "searchSelection:hand",
                from: "set:search-look",
                to: "hand",
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:search-look",
                owner: "self",
                destination: "deck",
                position: "bottom",
                order: "chooser",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:revealSelected",
        "instruction:moveSelected",
        "instruction:placeSetRemainder",
        "look:topDeck",
        "zone:deck",
        "count:positiveInteger",
        "filter:type",
        "cardinality:upTo",
        "destination:hand",
        "reveal:bothPlayers",
        "remaining:rest",
        "remaining:bottomDeck",
        "order:anyOrder",
      ]),
    );
  });

  it("parses public top-of-deck name-or-event search as decomposed looked-set primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 [Monkey.D.Luffy] or 1 red Event and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
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
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 5,
                saveAs: "set:search-look",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:search-look",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  anyOf: [
                    { names: ["Monkey.D.Luffy"] },
                    { colorsAny: ["red"], categories: ["event"] },
                  ],
                },
                saveAs: "searchSelection:hand",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "revealSelected",
                selection: "searchSelection:hand",
                visibility: "bothPlayers",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "moveSelected",
                selection: "searchSelection:hand",
                from: "set:search-look",
                to: "hand",
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:search-look",
                owner: "self",
                destination: "deck",
                position: "bottom",
                order: "chooser",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:revealSelected",
        "instruction:moveSelected",
        "instruction:placeSetRemainder",
        "filter:anyOf",
        "filter:name",
        "filter:color",
        "filter:category:event",
        "destination:hand",
        "reveal:bothPlayers",
        "remaining:bottomDeck",
      ]),
    );
  });

  it("parses plural public top-of-deck type search with trailing hand trash", () => {
    const result = parseCardEffectLine(
      "[Main] Look at 5 cards from the top of your deck; reveal up to 2 {Navy} type cards, add them to your hand and place the rest at the bottom of your deck in any order. Then, trash 1 card from your hand.",
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
              effect: {
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 5,
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                min: 0,
                max: 2,
                filter: { typesAny: ["Navy"] },
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "revealSelected",
                visibility: "bothPlayers",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "moveSelected",
                to: "hand",
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                destination: "deck",
                position: "bottom",
                order: "chooser",
              },
            },
            {
              connector: "then",
              effect: {
                type: "trashFromHand",
                player: "self",
                chooser: "self",
                count: 1,
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventMain",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:revealSelected",
        "instruction:moveSelected",
        "instruction:placeSetRemainder",
        "instruction:trashFromHand",
        "filter:type",
        "destination:hand",
        "remaining:bottomDeck",
      ]),
    );
  });

  it("parses costed private top-of-deck search with trailing trash compositionally", () => {
    const result = parseCardEffectLine(
      "[On Play] DON!! −1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
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
                      type: "revealTop",
                      player: "self",
                      zone: "deck",
                      count: 5,
                      saveAs: "set:search-look",
                      visibility: "chooserOnly",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "selectFromSet",
                      set: "set:search-look",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      filter: {},
                      saveAs: "searchSelection:hand",
                    },
                  },
                  {
                    connector: "ifPreviousSucceeded",
                    effect: {
                      type: "moveSelected",
                      selection: "searchSelection:hand",
                      from: "set:search-look",
                      to: "hand",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "placeSetRemainder",
                      set: "set:search-look",
                      owner: "self",
                      destination: "deck",
                      position: "bottom",
                      order: "chooser",
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
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "cost:returnDon",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:moveSelected",
        "instruction:placeSetRemainder",
        "look:topDeck",
        "filter:any",
        "reveal:chooserOnly",
        "remaining:bottomDeck",
        "instruction:trashFromHand",
      ]),
    );
  });

  it("parses public top-of-deck search with name exclusion, trash-rest policy, and trailing hand trash compositionally", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 3 cards from the top of your deck; reveal up to 1 {Celestial Dragons} type card other than [Saint Shalria] and add it to your hand. Then, trash the rest and trash 1 card from your hand.",
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
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 3,
                saveAs: "set:search-look",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:search-look",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  typesAny: ["Celestial Dragons"],
                  nameNot: ["Saint Shalria"],
                },
                saveAs: "searchSelection:hand",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "revealSelected",
                selection: "searchSelection:hand",
                visibility: "bothPlayers",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "moveSelected",
                selection: "searchSelection:hand",
                from: "set:search-look",
                to: "hand",
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:search-look",
                owner: "self",
                destination: "trash",
                position: "bottom",
                order: "original",
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
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:revealSelected",
        "instruction:moveSelected",
        "instruction:placeSetRemainder",
        "look:topDeck",
        "filter:type",
        "filter:nameNot",
        "reveal:bothPlayers",
        "remaining:trash",
        "instruction:trashFromHand",
      ]),
    );
  });

  it("parses private top-of-deck search with top-or-bottom remainder", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 3 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the top or bottom of the deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "revealTop", count: 3 } },
            { effect: { type: "selectFromSet", filter: {}, max: 1 } },
            { effect: { type: "moveSelected", to: "hand" } },
            {
              effect: {
                type: "placeSetRemainder",
                destination: "deck",
                position: "topOrBottom",
                order: "chooser",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:moveSelected",
        "instruction:placeSetRemainder",
        "reveal:chooserOnly",
        "remaining:bottomDeck",
        "position:top",
        "position:bottom",
      ]),
    );
  });

  it("parses top-deck placement when printed text says the deck", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 5 cards from the top of your deck and place them at the top or bottom of the deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "placeTopDeckCards",
          player: "self",
          count: 5,
          destination: "topOrBottom",
          order: "ownerChoice",
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:placeTopDeckCards",
        "look:topDeck",
        "position:top",
        "position:bottom",
      ]),
    );
  });

  it("parses public search with three comma-separated type alternatives", () => {
    const result = parseCardEffectLine(
      "[Main] Look at 3 cards from the top of your deck; reveal up to 1 {Straw Hat Crew}, {Kid Pirates}, or {Heart Pirates} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "revealTop", count: 3 } },
            {
              effect: {
                type: "selectFromSet",
                filter: {
                  typesAny: ["Straw Hat Crew", "Kid Pirates", "Heart Pirates"],
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
        "entry:eventMain",
        "filter:type",
        "instruction:placeSetRemainder",
      ]),
    );
  });

  it("parses search remainder followed by named play from hand", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 [Holly] and add it to your hand. Then, place the rest at the bottom of your deck in any order and play up to 1 [Holly] from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "revealTop", count: 5 } },
            { effect: { type: "selectFromSet", filter: { names: ["Holly"] } } },
            { effect: { type: "revealSelected" } },
            { effect: { type: "moveSelected", to: "hand" } },
            { effect: { type: "placeSetRemainder", position: "bottom" } },
            {
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      filter: { names: ["Holly"] },
                    },
                  },
                  { effect: { type: "playSelected" } },
                ],
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "filter:name",
        "instruction:playSelected",
        "composition:selectThenPlay",
      ]),
    );
  });

  it("parses rules text plus start-of-game stage play as separate primitives", () => {
    const result = parseCardEffectLine(
      "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck and at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "startOfGame" },
        sourcePresencePolicy: "noSourceRequired",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "selectCards",
                zone: "deck",
                player: "self",
                chooser: "self",
                filter: {
                  categories: ["stage"],
                  typesAny: ["Mary Geoise"],
                },
                min: 0,
                max: 1,
                saveAs: "selected:start-of-game",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "always",
              effect: {
                type: "playSelected",
                selection: "selected:start-of-game",
                ignoreCost: true,
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "deckRestriction:ignored",
        "deckRestriction:eventCostGte",
        "entry:startOfGame",
        "instruction:selectCards",
        "instruction:playSelected",
        "filter:type",
        "filter:category:stage",
        "destination:stageArea",
      ]),
    );
  });
});
