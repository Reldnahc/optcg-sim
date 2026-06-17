import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser hand-or-trash play composition", () => {
  it("parses opponent-turn On K.O. hand-or-trash play with quantified OR filters", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] [On K.O.] Play up to 1 {Revolutionary Army} type Character card with a cost of 6 or less other than [Koala] or up to 1 [Nico Robin] with a cost of 6 or less from your hand or trash.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onKO" },
        condition: { type: "opponentTurn" },
        effect: {
          type: "choice",
          options: [
            {
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      filter: {
                        anyOf: [
                          {
                            categories: ["character"],
                            typesAny: ["Revolutionary Army"],
                            cost: { max: 6 },
                            nameNot: ["Koala"],
                          },
                          { names: ["Nico Robin"], cost: { max: 6 } },
                        ],
                      },
                    },
                  },
                  { effect: { type: "playSelected" } },
                ],
              },
            },
            {
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectCards",
                      zone: "trash",
                      filter: {
                        anyOf: [
                          {
                            categories: ["character"],
                            typesAny: ["Revolutionary Army"],
                            cost: { max: 6 },
                            nameNot: ["Koala"],
                          },
                          { names: ["Nico Robin"], cost: { max: 6 } },
                        ],
                      },
                    },
                  },
                  { effect: { type: "playSelected" } },
                ],
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:opponentTurn",
        "instruction:playSelected",
        "filter:anyOf",
        "zone:hand",
        "zone:trash",
        "composition:chooseOne",
      ]),
    );
  });

  it("parses costed conditional hand-or-trash play sequence with independent quantified filters", () => {
    const result = parseCardEffectLine(
      "[Main] You may rest 7 of your DON!! cards: If your Leader is [Perona], play up to 1 {Thriller Bark Pirates} type Character card with a cost of 6 or less and up to 1 {Thriller Bark Pirates} type Character card with a cost of 4 or less from your hand or trash.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: { type: "restDon", count: 7 },
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
                  filter: { names: ["Perona"] },
                },
                then: {
                  type: "sequence",
                  effects: [
                    { effect: { type: "choice" } },
                    { connector: "then", effect: { type: "choice" } },
                  ],
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:optionalCostedEffect",
        "cost:restDon",
        "condition:leaderIdentity",
        "instruction:playSelected",
        "expression:sequence",
        "zone:hand",
        "zone:trash",
        "composition:chooseOne",
      ]),
    );
  });
});
