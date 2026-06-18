import { expect, it } from "vitest";

import { parseCardEffectLines } from "./card-effect-line-parser.js";

const parse = (text: string) => {
  const result = parseCardEffectLines(text)[0];
  if (result === undefined) {
    throw new Error(`Expected parser support for: ${text}`);
  }
  return result;
};

it("parses block-level and nested conditional continuous effects as reusable primitives", () => {
  const result = parse(
    "[DON!! x1] All of your Characters gain +1 cost. If you have a Character with a cost of 8 or more, this Leader gains +1000 power.",
  );

  expect(result.block).toMatchObject({
    category: "permanent",
    trigger: { type: "permanent" },
    condition: { type: "attachedDonCount", target: { type: "self" } },
    effect: {
      type: "sequence",
      effects: [
        {
          effect: {
            type: "modifyCost",
            target: {
              type: "all",
              player: "self",
              zone: "characterArea",
              filter: { categories: ["character"] },
            },
            value: 1,
            duration: { type: "whileConditionTrue" },
          },
        },
        {
          effect: {
            type: "modifyPower",
            target: { type: "myLeader" },
            value: 1000,
            duration: {
              type: "whileConditionTrue",
              condition: {
                type: "and",
                conditions: [
                  { type: "attachedDonCount" },
                  {
                    type: "fieldCount",
                    player: "self",
                    filter: {
                      categories: ["character"],
                      cost: { min: 8 },
                    },
                    op: "gte",
                    value: 1,
                  },
                ],
              },
            },
          },
        },
      ],
    },
  });
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "expression:conditionalContinuous",
      "condition:fieldCount",
      "instruction:modifyCost",
      "instruction:modifyPower",
    ]),
  );
});

it("parses compound hand and field-count conditions without binding them to draw", () => {
  const result = parse(
    "[On Play] If you have 6 or less cards in your hand and a Character with a cost of 8 or more, draw 1 card.",
  );

  expect(result.block).toMatchObject({
    trigger: { type: "onPlay" },
    condition: {
      type: "and",
      conditions: [
        { type: "handCount", player: "self", op: "lte", value: 6 },
        {
          type: "fieldCount",
          player: "self",
          filter: {
            categories: ["character"],
            cost: { min: 8 },
          },
          op: "gte",
          value: 1,
        },
      ],
    },
    effect: { type: "draw", count: 1, player: "self" },
  });
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "composition:conditionAnd",
      "condition:handCount",
      "condition:fieldCount",
      "instruction:draw",
    ]),
  );
});

it("parses own-effect Life-to-hand prevention as a continuous restriction primitive", () => {
  const result = parse(
    "[When Attacking] If your Leader is [Edward.Newgate], you cannot add Life cards to your hand using your own effects during this turn.",
  );

  expect(result.block).toMatchObject({
    trigger: { type: "whenAttacking" },
    condition: {
      type: "hasCardInZone",
      player: "self",
      zone: "leaderArea",
      filter: { categories: ["leader"], names: ["Edward.Newgate"] },
    },
    effect: {
      type: "preventLifeToHand",
      player: "self",
      source: "ownEffects",
      duration: { type: "thisTurn" },
    },
  });
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "instruction:preventLifeToHand",
      "target:player",
      "duration:thisTurn",
    ]),
  );
});

it("parses effect-caused self K.O. reactions as fieldRemoved triggers", () => {
  const result = parse(
    "[Opponent's Turn] When this Character is K.O.'d by an effect, up to 1 of your Leader gains +2000 power during this turn.",
  );

  expect(result.block).toMatchObject({
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    trigger: {
      type: "fieldRemoved",
      target: "self",
      player: "self",
      sourceKind: "effect",
    },
    effect: {
      type: "modifyPower",
      target: {
        type: "chooseFromZones",
        request: {
          player: "self",
          zones: ["leaderArea"],
          filter: { categories: ["leader"] },
          max: 1,
        },
      },
      value: 2000,
      duration: { type: "thisTurn" },
    },
  });
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "trigger:fieldRemoved",
      "target:thisCharacter",
      "replacementSource:cardEffect",
      "sourcePresence:resolveFromLastKnownInformation",
    ]),
  );
});

it("parses typed any-number hand trash into paid-cost dynamic power", () => {
  const result = parse(
    "[On Your Opponent's Attack] You may trash any number of {Music} type cards from your hand. Your Leader or 1 of your Characters gains +1000 power during this battle for every card trashed.",
  );

  expect(result.block).toMatchObject({
    trigger: { type: "onOpponentAttack" },
    effect: {
      type: "sequence",
      effects: [
        {
          effect: {
            type: "payCost",
            cost: {
              type: "trashFromHand",
              count: 0,
              maxCount: "available",
              filter: { typesAny: ["Music"] },
            },
          },
        },
        {
          connector: "ifYouDo",
          effect: {
            type: "modifyPower",
            value: {
              type: "paidCostCardCount",
              cost: "paidCost:trashFromHand",
              multiplier: 1000,
            },
            duration: { type: "thisBattle" },
          },
        },
      ],
    },
  });
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "cost:trashFromHand",
      "filter:type",
      "value:dynamic:paidCostCardCount",
      "target:yourLeaderOrCharacters",
    ]),
  );
});

it("parses rested named field presence as a reusable field-count condition", () => {
  const result = parse(
    "If you have a rested [Uta], this Character gains +1000 power.",
  );

  expect(result.block).toMatchObject({
    effect: {
      type: "modifyPower",
      target: { type: "self" },
      value: 1000,
      duration: {
        type: "whileConditionTrue",
        condition: {
          type: "fieldCount",
          player: "self",
          filter: {
            categories: ["character"],
            names: ["Uta"],
            state: "rested",
          },
          op: "gte",
          value: 1,
        },
      },
    },
  });
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "condition:fieldCount",
      "filter:name",
      "filter:state:rested",
      "instruction:modifyPower",
    ]),
  );
});

it("parses conditional hand-trash and draw as a block condition plus reusable sequence", () => {
  const result = parse(
    "[On Play] If you have 8 or more DON!! cards on your field, trash 1 card from your hand and draw 2 cards.",
  );

  expect(result.block).toMatchObject({
    trigger: { type: "onPlay" },
    condition: {
      type: "fieldCount",
      player: "self",
      filter: { categories: ["don"] },
      op: "gte",
      value: 8,
    },
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: { type: "trashFromHand", player: "self", count: 1 },
        },
        {
          connector: "then",
          effect: { type: "draw", player: "self", count: 2 },
        },
      ],
    },
  });
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "condition:donFieldCount",
      "instruction:trashFromHand",
      "connector:andOrdered",
      "instruction:draw",
    ]),
  );
});
