import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses play-from-trash followed by keyword grant to the played Character", () => {
  const result = parseCardEffectLine(
    "[On Play] If your Leader has the {Straw Hat Crew} type, play up to 1 {Straw Hat Crew} type Character with a cost of 7 or less from your trash. The Character played with this effect gains [Rush] during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
        },
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectCards",
              zone: "trash",
              player: "self",
              filter: {
                categories: ["character"],
                typesAny: ["Straw Hat Crew"],
                cost: { max: 7 },
              },
            },
          },
          {
            connector: "ifPossible",
            saveResultAs: "playedObject:with-effect",
            effect: { type: "playSelected", ignoreCost: true },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "giveKeyword",
              keyword: "rush",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "producedObjects",
                  saveResultAs: "playedObject:with-effect",
                },
              },
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "condition:leaderIdentity",
      "instruction:playSelected",
      "zone:trash",
      "instruction:giveKeyword",
      "keyword:anySupported",
      "duration:thisTurn",
      "composition:selectThenApply",
    ]),
  );
});

it("reuses played-object keyword grant with another play-selected source", () => {
  const result = parseCardEffectLine(
    "[On Play] Play up to 1 Character card with a cost of 2 or less from your hand. The Character played with this effect gains [Rush] during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
            },
          },
          {
            saveResultAs: "playedObject:with-effect",
            effect: { type: "playSelected" },
          },
          {
            effect: {
              type: "giveKeyword",
              target: {
                type: "savedFieldObject",
                binding: { family: "producedObjects" },
              },
            },
          },
        ],
      },
    },
  });
});
