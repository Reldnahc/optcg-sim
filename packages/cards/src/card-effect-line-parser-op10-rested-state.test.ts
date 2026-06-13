import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses rested Character field count into filtered Character activation", () => {
  const result = parseCardEffectLine(
    "[On Play] If you have 2 or more rested Characters, set up to 1 of your rested {ODYSSEY} type Characters with a cost of 5 or less as active.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["character"], state: "rested" },
        op: "gte",
        value: 2,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  typesAny: ["ODYSSEY"],
                  state: "rested",
                  cost: { max: 5 },
                },
              },
            },
          },
          {
            effect: {
              type: "activate",
              target: {
                type: "savedFieldObject",
                zone: "characterArea",
                player: "self",
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "condition:fieldCount",
      "filter:state:rested",
      "filter:type",
      "filter:cost",
      "instruction:activate",
    ]),
  );
});

it("parses rested typed Character count before rested DON refresh lock", () => {
  const result = parseCardEffectLine(
    "[On Play] If you have 2 or more rested {ODYSSEY} type Characters, up to 1 of your opponent's rested DON!! cards will not become active in your opponent's next Refresh Phase.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["ODYSSEY"],
          state: "rested",
        },
      },
      effect: {
        type: "cannotBecomeActive",
        target: {
          type: "chooseFromZones",
          request: {
            player: "opponent",
            zones: ["costArea"],
            filter: { categories: ["don"], state: "rested" },
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "condition:fieldCount",
      "filter:type",
      "filter:category:character",
      "filter:category:don",
      "filter:state:rested",
      "instruction:preventActivation",
      "duration:opponentNextRefreshPhase",
    ]),
  );
});
