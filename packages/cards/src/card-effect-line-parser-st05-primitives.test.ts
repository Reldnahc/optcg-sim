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
