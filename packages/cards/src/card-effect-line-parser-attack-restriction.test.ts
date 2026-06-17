import { expect, it } from "vitest";

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
