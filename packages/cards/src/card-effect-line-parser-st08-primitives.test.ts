import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses end-of-battle optional K.O. against the battled Character", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] At the end of a battle in which this Character battles your opponent's Character, you may K.O. the opponent's Character you battled with. If you do, K.O. this Character.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: {
        type: "endOfBattle",
        role: "attackerOrTarget",
        player: "self",
        filter: { categories: ["character"] },
        counterpartPlayer: "opponent",
        counterpartFilter: { categories: ["character"] },
      },
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: 1,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            optional: true,
            effect: {
              type: "ko",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "producedObjects",
                  saveResultAs: "trigger:battleCounterpart",
                },
                zone: "characterArea",
                player: "opponent",
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "ko",
              target: { type: "self" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "marker:attachedDon",
      "condition:attachedDonCount",
      "trigger:endOfBattle",
      "target:battleCounterpart",
      "instruction:ko",
      "target:thisCharacter",
      "composition:optionalActionEffect",
    ]),
  );
});

it("parses filtered end-of-battle owner deck-bottom movement against the battled Character", () => {
  const result = parseCardEffectLine(
    "[Your Turn] At the end of a battle in which this Character battles your opponent's Character with a cost of 5 or less, place the opponent's Character you battled with at the bottom of the owner's deck.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      condition: { type: "yourTurn" },
      trigger: {
        type: "endOfBattle",
        role: "attackerOrTarget",
        player: "self",
        filter: { categories: ["character"] },
        counterpartPlayer: "opponent",
        counterpartFilter: {
          categories: ["character"],
          cost: { max: 5 },
        },
      },
      effect: {
        type: "bounce",
        destination: "deckBottom",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "producedObjects",
            saveResultAs: "trigger:battleCounterpart",
          },
          zone: "characterArea",
          player: "opponent",
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "condition:yourTurn",
      "trigger:endOfBattle",
      "target:battleCounterpart",
      "filter:cost",
      "instruction:bounce",
      "destination:deck",
      "position:bottom",
    ]),
  );
});
