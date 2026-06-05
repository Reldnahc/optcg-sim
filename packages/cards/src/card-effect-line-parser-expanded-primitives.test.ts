import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser expanded reusable primitive shapes", () => {
  it("parses activate-main conditional Rush:Character grant without permanent relabeling", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] If your opponent has a Character with 8000 power or more, this Character gains [Rush: Character] during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        oncePerTurn: true,
        condition: {
          type: "fieldCount",
          player: "opponent",
          filter: {
            categories: ["character"],
            currentPower: { min: 8000 },
          },
          op: "gte",
          value: 1,
        },
        effect: {
          type: "giveKeyword",
          target: { type: "self" },
          keyword: "rushCharacter",
          duration: { type: "thisTurn" },
        },
      },
    });
  });

  it("parses comma-bearing OR leader condition into reusable search primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] If your Leader is [Sabo], [Portgas.D.Ace] or [Monkey.D.Luffy], look at 4 cards from the top of your deck; reveal up to 1 card with a cost of 3 or more and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: {
            categories: ["leader"],
            anyOf: [
              { names: ["Sabo"] },
              { names: ["Portgas.D.Ace"] },
              { names: ["Monkey.D.Luffy"] },
            ],
          },
        },
        effect: {
          type: "search",
          request: {
            zone: "deck",
            player: "self",
            lookCount: 4,
            filter: { cost: { min: 3 } },
            min: 0,
            max: 1,
            destination: "hand",
            revealTo: "bothPlayers",
            remainingCards: {
              destination: "deck",
              position: "bottom",
              order: "ownerChoice",
            },
          },
        },
      },
    });
  });

  it("parses turn-window leader keyword and power as independent continuous primitives", () => {
    const result = parseCardEffectLine(
      "[Your Turn] Your Leader gains [Double Attack] and +2000 power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        condition: { type: "yourTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "giveKeyword",
                target: { type: "myLeader" },
                keyword: "doubleAttack",
              },
            },
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: { type: "myLeader" },
                value: 2000,
              },
            },
          ],
        },
      },
    });
  });

  it("parses hand cost reduction with composed leader-name and DON-count conditions", () => {
    const result = parseCardEffectLine(
      'If your Leader\'s card name includes "Ace" and you have 6 or more DON!! cards on your field, give this card in your hand -2 cost.',
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyCost",
          player: "self",
          sourceZone: "hand",
          target: { type: "self" },
          value: -2,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "and",
              conditions: [
                { type: "hasCardInZone" },
                { type: "fieldCount", filter: { categories: ["don"] } },
              ],
            },
          },
        },
      },
    });
  });

  it("parses no-matching-character condition into negative power modifier", () => {
    const result = parseCardEffectLine(
      'If you have no Characters with a type including "Whitebeard Pirates" and a cost of 8 or more, give this Character -4000 power.',
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: -4000,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "fieldCount",
              player: "self",
              filter: {
                categories: ["character"],
                typesAny: ["Whitebeard Pirates"],
                cost: { min: 8 },
              },
              op: "eq",
              value: 0,
            },
          },
        },
      },
    });
  });
});
