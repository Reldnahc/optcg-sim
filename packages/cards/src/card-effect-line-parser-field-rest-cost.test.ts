import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses generic own field-card rest as an optional cost before Counter power", () => {
  expect(
    parseCardEffectLine(
      "[Counter] You may rest 1 of your cards: Up to 1 of your Leader or Character cards gains +4000 power during this battle.",
    ),
  ).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "counter" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "restFromField",
                count: 1,
                chooser: "self",
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              value: 4000,
              duration: { type: "thisBattle" },
            },
          },
        ],
      },
    },
    evidence: [
      "entry:eventCounter",
      "sourcePresence:resolveFromDestination",
      "composition:optionalCostedEffect",
      "cost:restFromField",
      "cardinality:exact",
      "count:positiveInteger",
      "chooser:self",
      "player:self",
      "filter:any",
      "instruction:modifyPower",
      "cardinality:upTo",
      "count:positiveInteger",
      "chooser:self:upTo",
      "target:yourLeaderOrCharacters",
      "player:self",
      "filter:category:leader",
      "filter:category:character",
      "modifier:positivePower",
      "duration:thisBattle",
      "composition:entryExpression",
    ],
  });
});

it("parses filtered own field-card rest before an unrelated Main body", () => {
  expect(
    parseCardEffectLine(
      "[Main] You may rest 2 of your {Straw Hat Crew} type Characters: Draw 1 card.",
    ),
  ).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "restFromField",
                count: 2,
                chooser: "self",
                filter: {
                  categories: ["character"],
                  typesAny: ["Straw Hat Crew"],
                },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
  });
});

it("parses own Leader-or-Stage rest cost before an unrelated conditional body", () => {
  const result = parseCardEffectLine(
    "[On Play] You may rest your Leader or 1 of your Stage cards: If your Leader is [Usopp], draw 1 card.",
  );

  expect(result).toMatchObject({
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
              cost: {
                type: "restFromField",
                count: 1,
                chooser: "self",
                filter: { categories: ["leader", "stage"] },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "hasCardInZone",
                zone: "leaderArea",
                player: "self",
                filter: { categories: ["leader"], names: ["Usopp"] },
              },
              then: { type: "draw", player: "self", count: 1 },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "composition:optionalCostedEffect",
      "cost:restFromField",
      "filter:category:leader",
      "filter:category:stage",
      "condition:leaderIdentity",
      "instruction:draw",
    ]),
  );
});
