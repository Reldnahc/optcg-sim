import { describe, expect, it } from "vitest";

import {
  parseCardEffectLine,
  parseCardEffectLineDetailed,
} from "./card-effect-line-parser.js";

describe("card effect line parser", () => {
  it("parses supported entry, marker, and composed draw/trash instructions", () => {
    expect(
      parseCardEffectLine(
        "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
      ),
    ).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        oncePerTurn: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", count: 2, player: "self" },
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
  });

  it("parses simple On Play draw through the default parser set", () => {
    expect(parseCardEffectLine("[On Play] Draw 1 card.")).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: { type: "draw", count: 1, player: "self" },
      },
      evidence: [
        "entry:onPlay",
        "sourcePresence:mustRemain",
        "instruction:draw",
        "count:positiveInteger",
        "player:self",
        "composition:entryExpression",
      ],
    });
  });

  it("parses On K.O. trash through the same instruction parser", () => {
    expect(
      parseCardEffectLine("[On K.O.] Trash 1 card from your hand."),
    ).toMatchObject({
      block: {
        trigger: { type: "onKO" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "trashFromHand",
          count: 1,
          player: "self",
          chooser: "self",
        },
      },
    });
  });

  it("recognizes unsupported entry points without marking them supported", () => {
    const result = parseCardEffectLine("[On Block] Draw 1 card.");

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onBlock" },
      },
    });
    expect(result?.evidence).toContain("entry:onBlock");
    expect(result?.evidence).toContain("entrySupport:unsupported");
    expect(result?.evidence).toContain("instruction:draw");
  });

  it("parses planned field primitives through composition instead of a full-line template", () => {
    const result = parseCardEffectLine(
      "[On Play] Rest up to 1 of your opponent's Characters and that Character will not become active in your opponent's next Refresh Phase. Then, if your opponent has 2 or more rested Characters, your Leader gains +2000 power until the end of your opponent's next End Phase.",
    );

    expect(result).toMatchObject({
      block: {
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
                      type: "custom",
                      handler: "planned:restOpponentCharacters",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "custom",
                      handler:
                        "planned:preventThatCharacterOpponentNextRefresh",
                    },
                  },
                ],
              },
            },
            {
              connector: "then",
              effect: {
                type: "conditional",
                if: {
                  type: "fieldCount",
                  player: "opponent",
                  filter: {
                    categories: ["character"],
                    state: "rested",
                  },
                  op: "gte",
                  value: 2,
                },
                then: {
                  type: "custom",
                  handler: "planned:yourLeaderPowerOpponentNextEnd",
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toContain("instructionSupport:planned");
    expect(result?.evidence).toContain("instruction:rest");
    expect(result?.evidence).toContain("instruction:preventActivation");
    expect(result?.evidence).toContain("condition:opponentFieldCount");
    expect(result?.evidence).toContain("instruction:modifyPower");
  });

  it("parses conditional continuous protection and keyword bodies compositionally", () => {
    const result = parseCardEffectLine(
      "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        condition: {
          type: "trashCount",
          player: "self",
          op: "gte",
          value: 7,
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "giveProtection",
                target: { type: "self" },
                duration: { type: "permanent" },
              },
            },
            {
              connector: "always",
              effect: {
                type: "giveKeyword",
                target: { type: "self" },
                keyword: "blocker",
                duration: { type: "permanent" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toContain("entry:implicitPermanent");
    expect(result?.evidence).toContain("condition:trashCount");
    expect(result?.evidence).toContain("instruction:giveProtection");
    expect(result?.evidence).toContain("instruction:giveKeyword");
    expect(result?.evidence).toContain("keyword:anySupported");
  });

  it("parses conditional continuous protection without requiring keyword text", () => {
    expect(
      parseCardEffectLine(
        "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects.",
      ),
    ).toMatchObject({
      block: {
        category: "permanent",
        effect: {
          type: "giveProtection",
          target: { type: "self" },
        },
      },
    });
  });

  it("parses conditional continuous keyword before protection", () => {
    expect(
      parseCardEffectLine(
        "If you have 7 or more cards in your trash, this Character gains [Banish] and cannot be removed from the field by your opponent's effects.",
      ),
    ).toMatchObject({
      block: {
        category: "permanent",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "giveKeyword", keyword: "banish" },
            },
            {
              connector: "always",
              effect: { type: "giveProtection" },
            },
          ],
        },
      },
    });
  });

  it("parses return-DON cost into an engine-supported On Play payCost sequence", () => {
    expect(parseCardEffectLine("[On Play] DON!! −1: Draw 1 card.")).toEqual({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "cost:return-don",
              connector: "always",
              effect: {
                type: "payCost",
                cost: { type: "returnDon", count: 1, optional: true },
              },
            },
            {
              id: "body:after-cost",
              connector: "ifYouDo",
              effect: { type: "draw", count: 1, player: "self" },
            },
          ],
        },
      },
      evidence: [
        "entry:onPlay",
        "sourcePresence:mustRemain",
        "composition:costedEffect",
        "cost:returnDon",
        "count:positiveInteger",
        "instruction:draw",
        "count:positiveInteger",
        "player:self",
        "composition:entryExpression",
      ],
    });
  });

  it("parses conditional attack power reduction compositionally", () => {
    expect(
      parseCardEffectLine(
        "[When Attacking] If you have 6 or less DON!! cards on your field, give up to 1 of your opponent's Characters −1000 power during this turn.",
      ),
    ).toMatchObject({
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
          type: "modifyPower",
          value: -1000,
          duration: { type: "thisTurn" },
        },
      },
    });
  });

  it("parses top-of-deck type search reveal as one reusable search request", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "search",
          request: {
            zone: "deck",
            player: "self",
            lookCount: 5,
            filter: { typesAny: ["Five Elders"] },
            min: 0,
            max: 1,
            destination: "hand",
            revealTo: "bothPlayers",
            remainingCards: {
              destination: "deck",
              position: "bottom",
              order: "ownerChoice",
            },
            shuffleAfter: false,
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:search",
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
                      type: "search",
                      request: {
                        zone: "deck",
                        player: "self",
                        lookCount: 5,
                        filter: {},
                        min: 0,
                        max: 1,
                        destination: "hand",
                        revealTo: "chooserOnly",
                        remainingCards: {
                          destination: "deck",
                          position: "bottom",
                          order: "ownerChoice",
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
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "cost:returnDon",
        "instruction:search",
        "look:topDeck",
        "filter:any",
        "reveal:chooserOnly",
        "remaining:bottomDeck",
        "instruction:trashFromHand",
      ]),
    );
  });

  it("fails closed for unknown entry points", () => {
    expect(parseCardEffectLine("[Unknown] Draw 1 card.")).toBeUndefined();
  });

  it("reports entry-point failures", () => {
    expect(parseCardEffectLineDetailed("[Unknown] Draw 1 card.")).toEqual({
      ok: false,
      diagnostic: {
        stage: "entryPoint",
        reason: "no entry-point parser matched",
        text: "[Unknown] Draw 1 card.",
      },
    });
  });

  it("reports expression failures after entry and marker parsing", () => {
    expect(
      parseCardEffectLineDetailed(
        "[When Attacking] [Once Per Turn] unsupported body.",
      ),
    ).toEqual({
      ok: false,
      diagnostic: {
        stage: "expression",
        reason: "no expression parser matched",
        text: "unsupported body.",
      },
    });
  });
});
