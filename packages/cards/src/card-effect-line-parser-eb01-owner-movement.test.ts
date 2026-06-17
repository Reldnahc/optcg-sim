import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses opponent-chosen active Character return after Counter power", () => {
  const result = parseCardEffectLine(
    "[Counter] If your Leader has the {Impel Down} type, up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, your opponent returns 1 of their active Characters to the owner's hand.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "counter" },
      condition: {
        type: "hasCardInZone",
        player: "self",
        zone: "leaderArea",
        filter: {
          categories: ["leader"],
          typesAny: ["Impel Down"],
        },
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "modifyPower",
              value: 2000,
              duration: { type: "thisBattle" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      chooser: "opponent",
                      player: "opponent",
                      zone: "characterArea",
                      min: 1,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        state: "active",
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "bounce",
                    destination: "hand",
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventCounter",
      "condition:leaderIdentity",
      "instruction:modifyPower",
      "instruction:returnToOwnerHand",
      "chooser:opponent",
      "filter:state:active",
      "destination:ownerHand",
    ]),
  );
});

it("parses return-to-owner-deck-bottom wording as owner deck-bottom placement", () => {
  const result = parseCardEffectLine(
    "[Trigger] Return up to 1 Character with a cost of 3 or less to the bottom of the owner's deck.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "trigger" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "anyPlayer",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  cost: { max: 3 },
                },
              },
            },
          },
          {
            effect: {
              type: "bounce",
              destination: "deckBottom",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:lifeTrigger",
      "instruction:moveSelected",
      "destination:deck",
      "position:bottom",
      "composition:selectThenApply",
    ]),
  );
});
