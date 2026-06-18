import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser Life movement", () => {
  it("parses Life and deck movement as reusable moveCards primitives", () => {
    const result = parseCardEffectLine(
      "[Main] If your Leader has the {Straw Hat Crew} type, trash 1 card from the top of your Life cards. Then, add up to 1 card from the top of your deck to the top of your Life cards and trash 1 card from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: {
            categories: ["leader"],
            typesAny: ["Straw Hat Crew"],
          },
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "moveCards",
                count: 1,
                from: { player: "self", zone: "life", position: "top" },
                to: { player: "self", zone: "trash" },
                order: "original",
              },
            },
            {
              connector: "then",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: {
                      type: "moveCards",
                      min: 0,
                      count: 1,
                      from: { player: "self", zone: "deck", position: "top" },
                      to: { player: "self", zone: "life", position: "top" },
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
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:leaderIdentity",
        "filter:type",
        "instruction:moveCards",
        "zone:life",
        "zone:deck",
        "destination:life",
        "destination:trash",
        "composition:entryExpression",
      ]),
    );
  });

  it("parses deck-to-Life followed by self damage as reusable move and damage primitives", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] [On K.O.] Add up to 1 card from the top of your deck to the top of your Life cards. Then, you take 1 damage.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onKO" },
        condition: { type: "opponentTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "moveCards",
                min: 0,
                count: 1,
                from: { player: "self", zone: "deck", position: "top" },
                to: { player: "self", zone: "life", position: "top" },
                order: "original",
              },
            },
            {
              connector: "then",
              effect: {
                type: "damage",
                target: "leader",
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
        "entry:onKO",
        "condition:opponentTurn",
        "instruction:moveCards",
        "destination:life",
        "instruction:damage",
        "player:self",
        "connector:then",
      ]),
    );
  });

  it("parses optional Life trash cost before conditional delayed deck-to-Life movement", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] You may trash 1 card from the top of your Life cards: If your Leader has the {Big Mom Pirates} type, add 1 card from the top of your deck to the top of your Life cards at the end of this turn.",
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
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "moveCards",
                  count: 1,
                  from: { player: "self", zone: "life", position: "top" },
                  to: { player: "self", zone: "trash" },
                  optional: true,
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "conditional",
                if: { type: "hasCardInZone", player: "self" },
                then: {
                  type: "delayed",
                  timing: { type: "endOfTurn", turn: "current" },
                  effect: {
                    type: "moveCards",
                    count: 1,
                    from: { player: "self", zone: "deck", position: "top" },
                    to: { player: "self", zone: "life", position: "top" },
                    order: "original",
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
        "entry:activateMain",
        "marker:oncePerTurn",
        "composition:optionalCostedEffect",
        "cost:moveCards",
        "condition:leaderIdentity",
        "instruction:moveCards",
        "zone:deck",
        "destination:life",
        "duration:endOfTurn",
        "composition:delayed",
      ]),
    );
  });
});
