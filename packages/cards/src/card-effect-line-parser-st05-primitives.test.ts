import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses battle-counterpart power gain as reusable attack-declared reaction plus power modifier", () => {
  const result = parseCardEffectLine(
    "When this Character battles ＜Strike＞ attribute Characters, this Character gains +3000 power during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: {
        type: "attackDeclared",
        role: "attackerOrTarget",
        player: "self",
        filter: { categories: ["character"] },
        counterpartPlayer: "opponent",
        counterpartFilter: {
          categories: ["character"],
          attributesAny: ["strike"],
        },
      },
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: 3000,
        duration: { type: "thisTurn" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "trigger:attackDeclared",
      "target:thisCharacter",
      "filter:category:character",
      "filter:attribute",
      "player:self",
      "player:opponent",
      "instruction:modifyPower",
      "target:thisCharacter",
      "modifier:positivePower",
      "duration:thisTurn",
    ]),
  );
});

it("parses selected Counter power with saved Character-only K.O. protection continuation", () => {
  const result = parseCardEffectLine(
    "[Counter] Up to 1 of your {FILM} type Leader or Character cards gains +4000 power during this battle. If that card is a Character, that Character cannot be K.O.'d during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "counter" },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "selectTargets" } },
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
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventCounter",
      "instruction:modifyPower",
      "instruction:giveProtection",
      "composition:savedTargetCondition",
      "condition:cardMatches",
      "filter:category:character",
      "protectionProcess:ko",
      "duration:thisBattle",
      "duration:thisTurn",
    ]),
  );
});
