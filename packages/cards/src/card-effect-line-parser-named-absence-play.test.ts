import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses named absence condition with reusable play-from-hand body", () => {
  const result = parseCardEffectLine(
    "[On Play] If you don't have [Rock], play up to 1 [Rock] from your hand.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { names: ["Rock"] },
        op: "eq",
        value: 0,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              filter: { names: ["Rock"] },
            },
          },
          {
            effect: {
              type: "playSelected",
              ignoreCost: true,
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "condition:fieldCount",
      "condition:comparator:eq",
      "condition:threshold:nonNegativeInteger",
      "filter:name",
      "instruction:playSelected",
      "zone:hand",
      "composition:selectThenPlay",
    ]),
  );
});

it("reuses named absence condition with another name and entry point", () => {
  const result = parseCardEffectLine(
    "[When Attacking] If you don't have [Scotch], play up to 1 [Scotch] from your hand.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "whenAttacking" },
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { names: ["Scotch"] },
        op: "eq",
        value: 0,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              filter: { names: ["Scotch"] },
            },
          },
          {
            effect: { type: "playSelected" },
          },
        ],
      },
    },
  });
});
