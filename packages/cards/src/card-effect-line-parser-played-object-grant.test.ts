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

it("parses costed play-from-trash followed by delayed owner deck-bottom for the played Character", () => {
  const result = parseCardEffectLine(
    "[On Play] You may trash 1 card from your hand: Draw 1 card and play up to 1 {SWORD} type Character card with a cost of 8 or less other than [Helmeppo] from your trash. Then, place the 1 Character played by this effect at the bottom of the owner's deck at the end of this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "trashFromHand",
                chooser: "self",
                count: 1,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: { type: "draw", count: 1, player: "self" },
                },
                {
                  connector: "then",
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
                            typesAny: ["SWORD"],
                            cost: { max: 8 },
                            nameNot: ["Helmeppo"],
                          },
                        },
                      },
                      {
                        connector: "ifPossible",
                        saveResultAs: "playedObject:with-effect",
                        effect: { type: "playSelected", ignoreCost: true },
                      },
                    ],
                  },
                },
                {
                  connector: "ifPreviousSucceeded",
                  effect: {
                    type: "delayed",
                    timing: { type: "endOfTurn", turn: "current" },
                    effect: {
                      type: "bounce",
                      destination: "deckBottom",
                      target: {
                        type: "savedFieldObject",
                        binding: {
                          family: "producedObjects",
                          saveResultAs: "playedObject:with-effect",
                        },
                        zone: "characterArea",
                        player: "self",
                        visibility: "publicOnly",
                        onFailure: "failClosed",
                      },
                    },
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
      "composition:optionalCostedEffect",
      "cost:trashFromHand",
      "instruction:draw",
      "instruction:playSelected",
      "zone:trash",
      "filter:type",
      "filter:nameNot",
      "composition:delayed",
      "duration:endOfTurn",
      "instruction:bounce",
      "reference:thatCharacter",
      "composition:selectThenMove",
    ]),
  );
});

it("reuses played-object delayed deck-bottom with a hand play source", () => {
  const result = parseCardEffectLine(
    "[When Attacking] Play up to 1 Character card with a cost of 2 or less from your hand. Then, place the 1 Character played by this effect at the bottom of the owner's deck at the end of this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "whenAttacking" },
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
              type: "delayed",
              effect: {
                type: "bounce",
                target: {
                  type: "savedFieldObject",
                  binding: { family: "producedObjects" },
                },
              },
            },
          },
        ],
      },
    },
  });
});
