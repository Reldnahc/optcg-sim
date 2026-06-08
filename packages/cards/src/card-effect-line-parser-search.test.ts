import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser search effects", () => {
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
                type: "search",
                request: {
                  zone: "deck",
                  player: "self",
                  lookCount: 3,
                  filter: {
                    typesAny: ["Celestial Dragons"],
                    nameNot: ["Saint Shalria"],
                  },
                  min: 0,
                  max: 1,
                  destination: "hand",
                  revealTo: "bothPlayers",
                  remainingCards: {
                    destination: "trash",
                  },
                  shuffleAfter: false,
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
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:search",
        "look:topDeck",
        "filter:type",
        "filter:nameNot",
        "reveal:bothPlayers",
        "remaining:trash",
        "instruction:trashFromHand",
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
                type: "search",
                request: {
                  zone: "deck",
                  player: "self",
                  filter: {
                    categories: ["stage"],
                    typesAny: ["Mary Geoise"],
                  },
                  min: 0,
                  max: 1,
                  destination: "stageArea",
                  revealTo: "chooserOnly",
                  shuffleAfter: false,
                },
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
        "instruction:search",
        "instruction:playSelected",
        "filter:type",
        "filter:category:stage",
        "destination:stageArea",
      ]),
    );
  });
});
