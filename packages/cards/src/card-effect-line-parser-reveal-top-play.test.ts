import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser reveal-top play effects", () => {
  it("parses revealed top-deck play with top-or-bottom remainder as decomposed primitives", () => {
    const result = parseCardEffectLine(
      '[On Play] Reveal 1 card from the top of your deck and play up to 1 Character card with a type including "Whitebeard Pirates" and a cost of 4 or less. Then, place the rest at the top or bottom of your deck.',
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
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 1,
                saveAs: "set:reveal-play",
                visibility: "bothPlayers",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:reveal-play",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  typesIncludeAny: ["Whitebeard Pirates"],
                  cost: { max: 4 },
                },
                saveAs: "revealSelection:play",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "playSelected",
                selection: "revealSelection:play",
                ignoreCost: true,
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:reveal-play",
                owner: "self",
                destination: "deck",
                position: "topOrBottom",
                order: "chooser",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:playSelected",
        "instruction:placeSetRemainder",
        "filter:category:character",
        "filter:type",
        "filter:cost",
        "position:top",
        "position:bottom",
      ]),
    );
  });

  it("composes revealed top-deck play with other supported counter body primitives", () => {
    const result = parseCardEffectLine(
      '[Counter] Up to 1 of your Leader or Character cards gains +3000 power during this battle. Then, reveal 1 card from the top of your deck and play up to 1 Character card with a type including "Whitebeard Pirates" and a cost of 3 or less. Then, place the rest at the top or bottom of your deck.',
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "modifyPower",
                duration: { type: "thisBattle" },
              },
            },
            {
              connector: "then",
              effect: {
                type: "sequence",
                effects: [
                  { effect: { type: "revealTop", visibility: "bothPlayers" } },
                  {
                    effect: {
                      type: "selectFromSet",
                      filter: {
                        categories: ["character"],
                        typesIncludeAny: ["Whitebeard Pirates"],
                        cost: { max: 3 },
                      },
                    },
                  },
                  { effect: { type: "playSelected" } },
                  {
                    effect: {
                      type: "placeSetRemainder",
                      position: "topOrBottom",
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
        "instruction:modifyPower",
        "duration:thisBattle",
        "instruction:revealTop",
        "instruction:playSelected",
        "instruction:placeSetRemainder",
      ]),
    );
  });

  it("parses revealed top-deck play rested with top-or-bottom remainder", () => {
    const result = parseCardEffectLine(
      "[When Attacking] Reveal 1 card from the top of your deck and play up to 1 Character card with a cost of 2 rested. Then, place the rest at the top or bottom of your deck.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "revealTop", visibility: "bothPlayers" } },
            {
              effect: {
                type: "selectFromSet",
                filter: {
                  categories: ["character"],
                  cost: { op: "eq", value: 2 },
                },
              },
            },
            { effect: { type: "playSelected", enterRested: true } },
            { effect: { type: "placeSetRemainder", position: "topOrBottom" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:whenAttacking",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:playSelected",
        "state:rested",
        "instruction:placeSetRemainder",
      ]),
    );
  });

  it("parses revealed top-deck play with bottom-only remainder", () => {
    const result = parseCardEffectLine(
      "[On Play] Reveal 1 card from the top of your deck and play up to 1 Character with a cost of 9 or less other than [Sanji]. Then, place the rest at the bottom of your deck.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "revealTop", visibility: "bothPlayers" } },
            {
              effect: {
                type: "selectFromSet",
                filter: {
                  categories: ["character"],
                  cost: { max: 9 },
                  nameNot: ["Sanji"],
                },
              },
            },
            { effect: { type: "playSelected" } },
            { effect: { type: "placeSetRemainder", position: "bottom" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "filter:category:character",
        "filter:cost",
        "filter:nameNot",
        "instruction:playSelected",
        "instruction:placeSetRemainder",
        "remaining:bottomDeck",
      ]),
    );
  });

  it("parses comma-separated revealed top-deck play with top-or-bottom remainder", () => {
    const result = parseCardEffectLine(
      "[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, reveal 1 card from the top of your deck, play up to 1 Character card with a cost of 2, and place the rest at the top or bottom of your deck.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "modifyPower",
                duration: { type: "thisBattle" },
              },
            },
            {
              connector: "then",
              effect: {
                type: "sequence",
                effects: [
                  { effect: { type: "revealTop" } },
                  {
                    effect: {
                      type: "selectFromSet",
                      filter: {
                        categories: ["character"],
                        cost: { op: "eq", value: 2 },
                      },
                    },
                  },
                  { effect: { type: "playSelected" } },
                  {
                    effect: {
                      type: "placeSetRemainder",
                      position: "topOrBottom",
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
        "instruction:modifyPower",
        "duration:thisBattle",
        "instruction:revealTop",
        "instruction:playSelected",
        "instruction:placeSetRemainder",
      ]),
    );
  });
});
