import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses self field-count conditional leader power loss as continuous primitives", () => {
  const result = parseCardEffectLine(
    "If you have a Character with 7000 base power or more, give this Leader -2000 power.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "modifyPower",
        target: { type: "myLeader" },
        value: -2000,
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "fieldCount",
            player: "self",
            op: "gte",
            value: 1,
            filter: {
              categories: ["character"],
              power: { min: 7000 },
            },
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "expression:conditionalContinuous",
      "condition:fieldCount",
      "target:yourLeader",
      "instruction:modifyPower",
      "modifier:negativePower",
      "duration:whileConditionTrue",
    ]),
  );
});

it("parses turn-window all named card power gain as reusable all-target continuous primitives", () => {
  const result = parseCardEffectLine(
    "[Opponent's Turn] All of your [Portgas.D.Ace] and [Monkey.D.Luffy] cards gain +3000 power.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "modifyPower",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: {
            anyOf: [
              { names: ["Portgas.D.Ace"] },
              { names: ["Monkey.D.Luffy"] },
            ],
          },
        },
        value: 3000,
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:opponentTurn",
      "cardinality:all",
      "filter:anyOf",
      "filter:name",
      "instruction:modifyPower",
      "modifier:positivePower",
    ]),
  );
});

it("parses base-power-filtered all Character power gain as reusable continuous primitives", () => {
  const result = parseCardEffectLine(
    "[Your Turn] All of your Characters with 6000 base power gain +1000 power.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "modifyPower",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: {
            categories: ["character"],
            power: { op: "eq", value: 6000 },
          },
        },
        value: 1000,
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:yourTurn",
      "cardinality:all",
      "filter:category:character",
      "filter:power",
      "condition:comparator:eq",
      "instruction:modifyPower",
    ]),
  );
});

it("parses On K.O. hand-trash cost into rested play-source without coupling the cost to the body", () => {
  const result = parseCardEffectLine(
    "[On K.O.] You may trash 1 Character card with 6000 power from your hand: Play this Character card from your trash rested.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onKO" },
      sourcePresencePolicy: "resolveFromDestinationZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "trashFromHand",
                count: 1,
                optional: true,
                filter: {
                  categories: ["character"],
                  power: { op: "eq", value: 6000 },
                },
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "playSource",
              ignoreCost: true,
              enterRested: true,
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onKO",
      "cost:trashFromHand",
      "instruction:playSource",
      "state:rested",
    ]),
  );
});

it("parses field-removal replacement with sequenced trash-self and draw instead primitives", () => {
  const result = parseCardEffectLine(
    "If your Character with 6000 base power would be removed from the field by your opponent's effect, you may trash this Character and draw 1 card instead.",
  );

  expect(result).toMatchObject({
    block: {
      category: "replacement",
      trigger: {
        type: "replacement",
        replacement: {
          type: "wouldMoveZone",
          from: "characterArea",
          sourceKind: "cardEffect",
          target: {
            type: "all",
            zone: "characterArea",
            player: "self",
            filter: {
              categories: ["character"],
              power: { op: "eq", value: 6000 },
            },
          },
        },
      },
      effect: {
        type: "replacement",
        instead: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "trash", target: { type: "self" } },
            },
            {
              connector: "then",
              effect: { type: "draw", count: 1, player: "self" },
            },
          ],
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "replacement:wouldMoveZone",
      "replacementSource:cardEffect",
      "filter:power",
      "composition:replacementInstead",
      "composition:sequence",
      "instruction:trash",
      "target:thisCharacter",
      "instruction:draw",
    ]),
  );
});
