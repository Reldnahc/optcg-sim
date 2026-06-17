import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";
import { parseCardEffectLinesDetailed } from "./card-effect-line-parser/index.js";

const hancockEffectText =
  "[On Play] Up to 1 of your opponent's Characters other than [Monkey.D.Luffy] cannot attack until the end of your opponent's next turn. Then, place up to 1 Character with a cost of 1 or less at the bottom of the owner's deck.";

describe("card effect line parser owner deck-bottom field movement", () => {
  it("parses selected cannot-attack followed by owner deck-bottom placement", () => {
    const result = parseCardEffectLine(hancockEffectText);

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
                    connector: "always",
                    saveResultAs: "selected:thatCharacter",
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "opponent",
                        zone: "characterArea",
                        min: 0,
                        max: 1,
                        filter: {
                          categories: ["character"],
                          nameNot: ["Monkey.D.Luffy"],
                        },
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "cannotAttack",
                      target: {
                        type: "savedFieldObject",
                        player: "opponent",
                        zone: "characterArea",
                      },
                      duration: {
                        type: "untilEndOfNextTurn",
                        player: "opponent",
                      },
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
                    saveResultAs: "selected:owner-deck-bottom",
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "anyPlayer",
                        zone: "characterArea",
                        min: 0,
                        max: 1,
                        filter: {
                          categories: ["character"],
                          cost: { max: 1 },
                        },
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "bounce",
                      destination: "deckBottom",
                      target: {
                        type: "savedFieldObject",
                        player: "anyPlayer",
                        zone: "characterArea",
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
        "instruction:preventActivation",
        "filter:nameNot",
        "duration:opponentNextEndPhase",
        "connector:then",
        "instruction:moveSelected",
        "player:any",
        "filter:cost",
        "destination:deck",
        "position:bottom",
        "composition:selectThenApply",
      ]),
    );
  });

  it("keeps top-level Then-separated source spans for the Hancock-style sequence", () => {
    const result = parseCardEffectLinesDetailed(hancockEffectText);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const parsed = result.value[0];
    if (parsed === undefined || !("block" in parsed)) {
      throw new Error("Expected runtime effect line.");
    }

    const spans = parsed.sourceMap?.spans ?? [];
    expect(spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "span:sequence:0:body",
          role: "body",
          text: "Up to 1 of your opponent's Characters other than [Monkey.D.Luffy] cannot attack until the end of your opponent's next turn.",
        }),
        expect.objectContaining({
          id: "span:sequence:1:body",
          role: "body",
          text: "place up to 1 Character with a cost of 1 or less at the bottom of the owner's deck.",
        }),
      ]),
    );
  });

  it.each([
    [
      "[Trigger] Place up to 1 Character with a cost of 5 or less at the bottom of the owner's deck.",
      { type: "trigger" },
      { player: "anyPlayer", max: 1, filter: { cost: { max: 5 } } },
    ],
    [
      "[Main] Place up to 1 Character at the bottom of the owner's deck.",
      { type: "main" },
      { player: "anyPlayer", max: 1, filter: { categories: ["character"] } },
    ],
    [
      "[Main] Place up to 1 of your opponent's Characters with 6000 power or less at the bottom of the owner's deck.",
      { type: "main" },
      {
        player: "opponent",
        max: 1,
        filter: { currentPower: { max: 6000 } },
      },
    ],
    [
      "[Main] Place up to 2 Characters with a cost of 6 or less at the bottom of the owner's deck in any order.",
      { type: "main" },
      { player: "anyPlayer", max: 2, filter: { cost: { max: 6 } } },
    ],
  ])(
    "parses reusable owner deck-bottom placement: %s",
    (text, trigger, request) => {
      const result = parseCardEffectLine(text);

      expect(result).toMatchObject({
        block: {
          category: "auto",
          trigger,
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                saveResultAs: "selected:owner-deck-bottom",
                effect: {
                  type: "selectTargets",
                  request: {
                    zone: "characterArea",
                    min: 0,
                    ...request,
                  },
                },
              },
              {
                connector: "then",
                effect: {
                  type: "bounce",
                  destination: "deckBottom",
                },
              },
            ],
          },
        },
      });
      expect(result?.evidence).toEqual(
        expect.arrayContaining([
          "instruction:moveSelected",
          "destination:deck",
          "position:bottom",
        ]),
      );
      if (text.includes("in any order")) {
        expect(result?.evidence).toContain("order:anyOrder");
      }
    },
  );

  it("parses public trash selection moved to the owner's deck bottom", () => {
    const result = parseCardEffectLine(
      "[On Play] Place up to 1 card from your opponent's trash at the bottom of the owner's deck.",
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
              saveResultAs: "trashSelection:owner-deck-bottom",
              effect: {
                type: "selectCards",
                zone: "trash",
                player: "opponent",
                chooser: "self",
                min: 0,
                max: 1,
                saveAs: "trashSelection:owner-deck-bottom",
                visibility: "bothPlayers",
              },
            },
            {
              connector: "then",
              effect: {
                type: "moveSelected",
                selection: "trashSelection:owner-deck-bottom",
                from: "trash",
                to: "deck",
                position: "bottom",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:moveSelected",
        "zone:trash",
        "player:opponent",
        "destination:deck",
        "position:bottom",
        "composition:selectThenMove",
      ]),
    );
  });

  it("parses repeated owner deck-bottom placements under an optional hand-trash cost", () => {
    const result = parseCardEffectLine(
      "[On Play] You may trash 1 card from your hand: Place up to 1 of your opponent's Characters with 4000 base power or less and up to 1 Character with a base cost of 3 or less at the bottom of the owner's deck.",
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
                cost: { type: "trashFromHand", count: 1 },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "sequence",
                      effects: [
                        {
                          effect: {
                            type: "selectTargets",
                            request: {
                              player: "opponent",
                              zone: "characterArea",
                              min: 0,
                              max: 1,
                              filter: {
                                categories: ["character"],
                                power: { max: 4000 },
                              },
                            },
                          },
                        },
                        {
                          effect: {
                            type: "bounce",
                            destination: "deckBottom",
                            target: {
                              type: "savedFieldObject",
                              player: "opponent",
                              zone: "characterArea",
                            },
                          },
                        },
                      ],
                    },
                  },
                  {
                    effect: {
                      type: "sequence",
                      effects: [
                        {
                          effect: {
                            type: "selectTargets",
                            request: {
                              player: "anyPlayer",
                              zone: "characterArea",
                              min: 0,
                              max: 1,
                              filter: {
                                categories: ["character"],
                                baseCost: { max: 3 },
                              },
                            },
                          },
                        },
                        {
                          effect: {
                            type: "bounce",
                            destination: "deckBottom",
                            target: {
                              type: "savedFieldObject",
                              player: "anyPlayer",
                              zone: "characterArea",
                            },
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
        "cost:trashFromHand",
        "instruction:moveSelected",
        "player:opponent",
        "player:any",
        "filter:power",
        "filter:cost",
        "destination:deck",
        "position:bottom",
        "composition:sequence",
      ]),
    );
  });
});
