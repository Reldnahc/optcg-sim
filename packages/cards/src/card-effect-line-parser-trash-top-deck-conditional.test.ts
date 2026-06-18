import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses trashed top-deck card predicates into saved-card conditional bodies", () => {
  const result = parseCardEffectLine(
    "[Counter] Trash 1 card from the top of your deck. If the trashed card has a cost of 6 or more, up to 1 of your Leader or Character cards gains +5000 power during this battle.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "counter" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:trashed-top-deck",
            saveResultKinds: ["selectedCards:deck"],
            effect: {
              type: "moveCards",
              count: 1,
              from: { player: "self", zone: "deck", position: "top" },
              to: { player: "self", zone: "trash" },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "conditional",
              if: {
                type: "cardMatches",
                target: {
                  type: "savedSelectedCard",
                  selection: "selected:trashed-top-deck",
                  onFailure: "failClosed",
                },
                filter: { cost: { min: 6 } },
              },
              then: {
                type: "modifyPower",
                value: 5000,
                duration: { type: "thisBattle" },
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
      "instruction:moveCards",
      "condition:cardMatches",
      "filter:cost",
      "condition:comparator:gte",
      "instruction:modifyPower",
      "duration:thisBattle",
    ]),
  );
});

it("reuses trashed top-deck predicates under another entry point and body", () => {
  const result = parseCardEffectLine(
    "[On Play] Trash 1 card from the top of your deck. If the trashed card has a cost of 6 or more, draw 1 card.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "moveCards" } },
          {
            effect: {
              type: "conditional",
              if: {
                type: "cardMatches",
                target: { type: "savedSelectedCard" },
              },
              then: { type: "draw", count: 1, player: "self" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:moveCards",
      "condition:cardMatches",
      "instruction:draw",
    ]),
  );
});
