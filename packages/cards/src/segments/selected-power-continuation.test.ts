import { describe, expect, it } from "vitest";

import {
  conditionalAdditionalSelectedPowerContinuationExpressionParser,
  selectedPowerContinuationExpressionParser,
} from "./selected-power-continuation.js";
import { parseTrashCountCondition } from "../conditions/index.js";

describe("selected power continuation expression parser", () => {
  it("saves a selected power target and applies an additional modifier to that card", () => {
    const result = selectedPowerContinuationExpressionParser({
      text: "up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, that card gains an additional +2000 power during this turn.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:power-continuation-target",
            effect: {
              type: "selectTargets",
              request: {
                chooser: "self",
                player: "self",
                zones: ["leaderArea", "characterArea"],
                min: 0,
                max: 1,
                filter: { categories: ["leader", "character"] },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "modifyPower",
              value: 2000,
              duration: { type: "thisBattle" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "modifyPower",
              value: 2000,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:modifyPower",
        "composition:selectThenApply",
        "target:selectedCharacter",
        "duration:thisBattle",
        "duration:thisTurn",
      ]),
    );
  });

  it("reuses a selected field-activation target for a following power modifier", () => {
    const result = selectedPowerContinuationExpressionParser({
      text: "Set up to 1 of your {Supernovas} or {Straw Hat Crew} type Character cards with a cost of 5 or less as active. It gains +1000 power during this turn.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "targetSelection:set-field-active",
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  typesAny: ["Supernovas", "Straw Hat Crew"],
                  cost: { max: 5 },
                },
              },
            },
          },
          {
            effect: { type: "activate" },
          },
          {
            effect: {
              type: "modifyPower",
              value: 1000,
              duration: { type: "thisTurn" },
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "targetSelection:set-field-active",
                },
              },
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:activate",
        "instruction:modifyPower",
        "target:selectedCharacter",
        "duration:thisTurn",
        "composition:selectThenApply",
      ]),
    );
  });

  it("saves a selected power target and conditionally grants that card a keyword", () => {
    const result =
      conditionalAdditionalSelectedPowerContinuationExpressionParser({
        conditions: [parseTrashCountCondition],
      })({
        text: "up to 1 of your {Dressrosa} type Characters gains +2000 power during this turn. Then, if you have 10 or more cards in your trash, that card gains [Banish] during this turn.",
      });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "selected:power-continuation-target",
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  typesAny: ["Dressrosa"],
                },
              },
            },
          },
          {
            effect: {
              type: "modifyPower",
              value: 2000,
            },
          },
          {
            effect: {
              type: "conditional",
              if: { type: "trashCount", player: "self", op: "gte", value: 10 },
              then: {
                type: "giveKeyword",
                keyword: "banish",
              },
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:modifyPower",
        "instruction:giveKeyword",
        "keyword:anySupported",
        "expression:conditional",
        "condition:trashCount",
        "duration:thisTurn",
      ]),
    );
  });

  it("saves a selected power target and applies refresh lock to the selected Character", () => {
    const result = selectedPowerContinuationExpressionParser({
      text: "Up to 1 of your {Straw Hat Crew} type Characters gains +6000 power during this turn. Then, the selected Character will not become active in your next Refresh Phase.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "selected:power-continuation-target",
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  typesAny: ["Straw Hat Crew"],
                },
              },
            },
          },
          {
            effect: {
              type: "modifyPower",
              value: 6000,
              duration: { type: "thisTurn" },
            },
          },
          {
            effect: {
              type: "cannotBecomeActive",
              duration: { type: "untilStartOfNextTurn", player: "self" },
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:modifyPower",
        "instruction:preventActivation",
        "target:selectedCharacter",
        "duration:thisTurn",
        "duration:selfNextRefreshPhase",
      ]),
    );
  });

  it("saves up to 2 selected targets and distributes different power modifiers by selected order", () => {
    const result = selectedPowerContinuationExpressionParser({
      text: "Select up to 2 of your opponent's Characters, and give 1 Character −3000 power and the other −2000 power until the end of your opponent's next turn.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:distributed-power-targets",
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 2,
                filter: { categories: ["character"] },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "modifyPower",
              value: -3000,
              target: {
                binding: {
                  saveResultAs: "selected:distributed-power-targets",
                  objectIndex: 0,
                },
              },
              duration: { type: "untilEndOfNextTurn", player: "opponent" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "modifyPower",
              value: -2000,
              target: {
                binding: {
                  saveResultAs: "selected:distributed-power-targets",
                  objectIndex: 1,
                },
              },
              duration: { type: "untilEndOfNextTurn", player: "opponent" },
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:selectThenApply",
        "instruction:selectTargets",
        "instruction:modifyPower",
        "target:opponentCharacters",
        "duration:opponentNextEndPhase",
      ]),
    );
  });

  it("saves a selected power target and conditionally protects that card from K.O. if it is a Character", () => {
    const result = selectedPowerContinuationExpressionParser({
      text: "Up to 1 of your {FILM} type Leader or Character cards gains +4000 power during this battle. If that card is a Character, that Character cannot be K.O.'d during this turn.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "selected:power-continuation-target",
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zones: ["leaderArea", "characterArea"],
                filter: {
                  categories: ["leader", "character"],
                  typesAny: ["FILM"],
                },
              },
            },
          },
          {
            effect: {
              type: "modifyPower",
              value: 4000,
              duration: { type: "thisBattle" },
            },
          },
          {
            effect: {
              type: "conditional",
              if: {
                type: "cardMatches",
                filter: { categories: ["character"] },
              },
              then: {
                type: "protectFromKO",
                duration: { type: "thisTurn" },
              },
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:modifyPower",
        "instruction:giveProtection",
        "composition:selectThenApply",
        "composition:savedTargetCondition",
        "condition:cardMatches",
        "filter:category:character",
        "protectionProcess:ko",
        "duration:thisBattle",
        "duration:thisTurn",
      ]),
    );
  });
});
