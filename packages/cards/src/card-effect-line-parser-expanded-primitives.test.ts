import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser expanded reusable primitive shapes", () => {
  const blockEffect = (result: ReturnType<typeof parseCardEffectLine>) =>
    result !== undefined && "block" in result ? result.block.effect : undefined;

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
          type: "sequence",
          effects: [
            { effect: { type: "revealTop", count: 4 } },
            { effect: { type: "selectFromSet", filter: { cost: { min: 3 } } } },
            { effect: { type: "revealSelected" } },
            { effect: { type: "moveSelected", to: "hand" } },
            { effect: { type: "placeSetRemainder", position: "bottom" } },
          ],
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

  it("parses forced opponent DON return under different wrappers", () => {
    const onPlay = parseCardEffectLine(
      "[On Play] If your Leader has the {Impel Down} type, your opponent returns 1 DON!! card from their field to their DON!! deck.",
    );
    const onKo = parseCardEffectLine(
      "[On K.O.] Your opponent returns 4 DON!! cards from their field to their DON!! deck.",
    );

    expect(onPlay?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "condition:leaderIdentity",
        "filter:type",
        "instruction:returnDon",
        "player:opponent",
        "count:positiveInteger",
        "expression:conditional",
      ]),
    );
    expect(onKo?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onKO",
        "instruction:returnDon",
        "player:opponent",
        "count:positiveInteger",
      ]),
    );
  });

  it("parses global all-character KO with source exclusion", () => {
    const result = parseCardEffectLine(
      "[When Attacking] DON!! \u221210: K.O. all Characters other than this Character.",
    );

    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:whenAttacking",
        "cost:returnDon",
        "instruction:ko",
        "cardinality:all",
        "player:any",
        "filter:category:character",
        "filter:excludeSelf",
      ]),
    );
  });

  it("parses up-to opponent life top trash as movement, not damage", () => {
    const result = parseCardEffectLine(
      "[When Attacking] Trash up to 1 card from the top of your opponent's Life cards.",
    );

    expect(blockEffect(result)).toMatchObject({
      type: "moveCards",
      min: 0,
      count: 1,
      from: { player: "opponent", zone: "life", position: "top" },
      to: { player: "opponent", zone: "trash" },
      order: "original",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:moveCards",
        "cardinality:upTo",
        "player:opponent",
        "zone:life",
        "destination:trash",
      ]),
    );
    expect(result?.evidence).not.toContain("instruction:damage");
  });

  it("parses selected character current power as a base-power snapshot source", () => {
    const result = parseCardEffectLine(
      "[When Attacking] Select up to 1 of your opponent's Characters. This Character's base power becomes the same as the selected Character's power during this turn.",
    );

    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:whenAttacking",
        "composition:selectThenApply",
        "instruction:setBasePower",
        "target:thisCharacter",
        "target:selectedCharacter",
        "value:basePower:snapshotCurrentPower",
        "duration:thisTurn",
      ]),
    );
  });
});
