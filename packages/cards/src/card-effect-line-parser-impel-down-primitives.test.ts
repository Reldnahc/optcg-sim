import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser Impel Down primitive family", () => {
  it("parses comma-style search then play as search composition plus play primitive", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 3 cards from the top of your deck; reveal up to 1 {Impel Down} type card, add it to your hand and place the rest at the bottom of your deck in any order. Then, play up to 1 Character card with a cost of 2 or less from your hand.",
    );

    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "look:topDeck",
        "reveal:bothPlayers",
        "filter:type",
        "destination:hand",
        "remaining:bottomDeck",
        "instruction:playSelected",
        "filter:cost",
        "expression:sequence",
      ]),
    );
  });

  it("parses opponent rest protection as selected target plus protection", () => {
    const result = parseCardEffectLine(
      "[On Play] Up to 1 of your opponent's Characters other than [Monkey.D.Luffy] cannot be rested until the end of your opponent's next End Phase.",
    );

    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:giveProtection",
        "target:opponentCharacters",
        "filter:nameNot",
        "protectionProcess:rest",
        "duration:opponentNextEndPhase",
      ]),
    );
  });

  it("parses DON-conditioned turn-window power per distinct card name", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [Your Turn] This Character gains +1000 power for each of your Characters with a different card name.",
    );

    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:yourTurn",
        "marker:attachedDon",
        "instruction:modifyPower",
        "value:dynamic:distinctFieldNames",
        "filter:differentNames",
      ]),
    );
  });

  it("parses distinct-name condition into mass field activation", () => {
    const result = parseCardEffectLine(
      "[Main] You may rest 6 of your DON!! cards: If you have 5 {Impel Down} type Characters with different card names, set your Leader and all of your Characters as active.",
    );

    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventMain",
        "cost:restDon",
        "condition:fieldCount",
        "filter:differentNames",
        "instruction:activate",
        "target:yourLeader",
        "cardinality:all",
        "expression:conditional",
      ]),
    );
  });

  it("parses DON-costed looked-set play and bottoms only the rest", () => {
    const result = parseCardEffectLine(
      "[Main] You may rest 7 of your DON!! cards: Look at 5 cards from the top of your deck; play up to 2 {Impel Down} type Character cards with 6000 power or less. Then, place the rest at the bottom of your deck in any order.",
    );

    expect(result).toMatchObject({
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
                cost: { type: "restDon", count: 7, optional: true },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: {
                      type: "revealTop",
                      player: "self",
                      zone: "deck",
                      count: 5,
                      saveAs: "set:look-play",
                      visibility: "chooserOnly",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "selectFromSet",
                      set: "set:look-play",
                      chooser: "self",
                      min: 0,
                      max: 2,
                      filter: {
                        categories: ["character"],
                        typesAny: ["Impel Down"],
                        power: { max: 6000 },
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
                      set: "set:look-play",
                      owner: "self",
                      destination: "deck",
                      position: "bottom",
                      order: "chooser",
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
        "entry:eventMain",
        "cost:restDon",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:playSelected",
        "instruction:placeSetRemainder",
        "filter:type",
        "filter:category:character",
        "filter:power",
        "remaining:bottomDeck",
        "order:anyOrder",
      ]),
    );
  });

  it("parses base power snapshot from opponent leader current power", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [When Attacking] This Character's base power becomes the same as your opponent's Leader's power during this turn.",
    );

    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:whenAttacking",
        "marker:attachedDon",
        "instruction:setBasePower",
        "target:thisCharacter",
        "target:opponentLeader",
        "value:basePower:snapshotCurrentPower",
        "duration:thisTurn",
      ]),
    );
  });
});
