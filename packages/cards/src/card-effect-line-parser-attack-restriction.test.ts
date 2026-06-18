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
