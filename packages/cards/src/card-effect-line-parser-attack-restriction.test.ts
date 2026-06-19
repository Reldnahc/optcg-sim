import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";
import { parsePreventOpponentCharactersAttackInstruction } from "./instructions/planned-field-effects/attack-restriction.js";

it("parses opponent rested Leader or selected Character attack restrictions", () => {
  const parsed = parsePreventOpponentCharactersAttackInstruction({
    text: "Your opponent's rested Leader or up to 1 of your opponent's Characters other than [Monkey.D.Luffy] cannot attack until the end of your opponent's next End Phase.",
  });

  expect(parsed).toMatchObject({
    effect: {
      type: "sequence",
      effects: [
        {
          saveResultAs: "selected:thatCharacter",
          effect: {
            type: "selectTargets",
            request: {
              player: "opponent",
              zones: ["leaderArea", "characterArea"],
              min: 0,
              max: 1,
              filter: {
                anyOf: [
                  { categories: ["leader"], state: "rested" },
                  {
                    categories: ["character"],
                    nameNot: ["Monkey.D.Luffy"],
                  },
                ],
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
              zones: ["leaderArea", "characterArea"],
            },
            duration: { type: "untilEndOfNextTurn", player: "opponent" },
          },
        },
      ],
    },
    rest: "",
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "instruction:preventActivation",
      "cardinality:upTo",
      "count:positiveInteger",
      "chooser:self:upTo",
      "player:opponent",
      "target:opponentLeaderOrCharacters",
      "filter:anyOf",
      "filter:category:leader",
      "filter:state:rested",
      "filter:category:character",
      "filter:nameNot",
      "duration:opponentNextEndPhase",
      "composition:selectThenApply",
    ]),
  );
});

it("parses selected opponent rested Leader attack restrictions", () => {
  const parsed = parsePreventOpponentCharactersAttackInstruction({
    text: "Up to 1 of your opponent's rested Leader cannot attack until the end of your opponent's next turn.",
  });

  expect(parsed).toMatchObject({
    effect: {
      type: "sequence",
      effects: [
        {
          saveResultAs: "selected:thatCharacter",
          effect: {
            type: "selectTargets",
            request: {
              player: "opponent",
              zones: ["leaderArea"],
              min: 0,
              max: 1,
              filter: {
                categories: ["leader"],
                state: "rested",
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
              zones: ["leaderArea"],
            },
            duration: { type: "untilEndOfNextTurn", player: "opponent" },
          },
        },
      ],
    },
    rest: "",
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "instruction:preventActivation",
      "cardinality:upTo",
      "count:positiveInteger",
      "chooser:self:upTo",
      "target:opponentLeader",
      "player:opponent",
      "filter:category:leader",
      "filter:state:rested",
      "duration:opponentNextEndPhase",
      "composition:selectThenApply",
    ]),
  );
});

it("parses selected opponent Leader or Character card attack restrictions", () => {
  const parsed = parsePreventOpponentCharactersAttackInstruction({
    text: "Up to 1 of your opponent's Leader or Character cards cannot attack during this turn.",
  });

  expect(parsed).toMatchObject({
    effect: {
      type: "sequence",
      effects: [
        {
          saveResultAs: "selected:thatCharacter",
          effect: {
            type: "selectTargets",
            request: {
              player: "opponent",
              zones: ["leaderArea", "characterArea"],
              min: 0,
              max: 1,
              filter: {
                categories: ["leader", "character"],
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
              zones: ["leaderArea", "characterArea"],
            },
            duration: { type: "thisTurn" },
          },
        },
      ],
    },
    rest: "",
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "instruction:preventActivation",
      "cardinality:upTo",
      "count:positiveInteger",
      "chooser:self:upTo",
      "target:opponentLeaderOrCharacters",
      "player:opponent",
      "filter:category:leader",
      "filter:category:character",
      "duration:thisTurn",
      "composition:selectThenApply",
    ]),
  );
});

it("parses Trigger opponent Leader or Character card attack restrictions", () => {
  const result = parseCardEffectLine(
    "[Trigger] Up to 1 of your opponent's Leader or Character cards cannot attack during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "trigger" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zones: ["leaderArea", "characterArea"],
              },
            },
          },
          {
            effect: { type: "cannotAttack", duration: { type: "thisTurn" } },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:lifeTrigger",
      "instruction:preventActivation",
      "target:opponentLeaderOrCharacters",
      "duration:thisTurn",
    ]),
  );
});

it("parses continuous opponent attacks-only-named-Character restrictions", () => {
  const result = parseCardEffectLine(
    '[DON!! x1] [Opponent\'s Turn] If this Character is rested, your opponent cannot attack any card other than the Character [Eustass"Captain"Kid].',
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      condition: {
        type: "and",
        conditions: [
          { type: "attachedDonCount", op: "gte", value: 1 },
          { type: "opponentTurn" },
        ],
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "cannotAttackTarget",
              target: { type: "player", player: "opponent" },
              attackTarget: {
                player: "self",
                zone: "leaderArea",
                filter: { categories: ["leader"] },
              },
              duration: {
                type: "whileConditionTrue",
                condition: {
                  type: "and",
                  conditions: [
                    {
                      type: "and",
                      conditions: [
                        {
                          type: "attachedDonCount",
                          target: { type: "self" },
                          op: "gte",
                          value: 1,
                        },
                        { type: "opponentTurn" },
                      ],
                    },
                    {
                      type: "cardState",
                      target: { type: "self" },
                      state: "rested",
                    },
                  ],
                },
              },
            },
          },
          {
            effect: {
              type: "cannotAttackTarget",
              target: { type: "player", player: "opponent" },
              attackTarget: {
                player: "self",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  nameNot: ['Eustass"Captain"Kid'],
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
      "marker:attachedDon",
      "entry:opponentTurn",
      "expression:conditionalContinuous",
      "condition:cardState",
      "instruction:cannotAttackTarget",
      "player:opponent",
      "player:self",
      "filter:nameNot",
      "duration:whileConditionTrue",
    ]),
  );
});

it("parses selected opponent Character attack restrictions until the start of your next turn", () => {
  const parsed = parsePreventOpponentCharactersAttackInstruction({
    text: "Up to 1 of your opponent's Characters with a cost of 7 or less cannot attack until the start of your next turn.",
  });

  expect(parsed).toMatchObject({
    effect: {
      type: "sequence",
      effects: [
        {
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
                cost: { max: 7 },
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
            duration: { type: "untilStartOfNextTurn", player: "self" },
          },
        },
      ],
    },
    rest: "",
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "instruction:preventActivation",
      "cardinality:upTo",
      "target:opponentCharacters",
      "filter:cost",
      "duration:selfNextTurnStart",
      "composition:selectThenApply",
    ]),
  );
});

it("parses On Play selected opponent Character attack restrictions until the start of your next turn", () => {
  const parsed = parseCardEffectLine(
    "[On Play] Up to 1 of your opponent's Characters with a cost of 7 or less cannot attack until the start of your next turn.",
  );

  expect(parsed).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                max: 1,
                filter: {
                  categories: ["character"],
                  cost: { max: 7 },
                },
              },
            },
          },
          {
            effect: {
              type: "cannotAttack",
              duration: { type: "untilStartOfNextTurn", player: "self" },
            },
          },
        ],
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:preventActivation",
      "duration:selfNextTurnStart",
      "composition:selectThenApply",
    ]),
  );
});

it("parses optional hand-trash cost into selected opponent rested Leader attack restrictions", () => {
  const parsed = parseCardEffectLine(
    "[On Play] You may trash 1 card from your hand: Up to 1 of your opponent's rested Leader cannot attack until the end of your opponent's next turn.",
  );

  expect(parsed).toMatchObject({
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
              cost: { type: "trashFromHand", count: 1, optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zones: ["leaderArea"],
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["leader"],
                        state: "rested",
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "cannotAttack",
                    duration: {
                      type: "untilEndOfNextTurn",
                      player: "opponent",
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
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "cost:trashFromHand",
      "instruction:preventActivation",
      "target:opponentLeader",
      "filter:state:rested",
      "duration:opponentNextEndPhase",
    ]),
  );
});
