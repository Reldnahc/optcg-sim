import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser play from hand OR alternatives", () => {
  it("parses separately quantified hand-play alternatives as one reusable anyOf selection", () => {
    const result = parseCardEffectLine(
      "[On Play] Play up to 1 [Heavenly Warriors] with a cost of 1 or up to 1 {Vassals} type Character card with a cost of 1 from your hand.",
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
                type: "selectCards",
                zone: "hand",
                player: "self",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  anyOf: [
                    {
                      names: ["Heavenly Warriors"],
                      cost: { op: "eq", value: 1 },
                    },
                    {
                      categories: ["character"],
                      typesAny: ["Vassals"],
                      cost: { op: "eq", value: 1 },
                    },
                  ],
                },
              },
            },
            {
              connector: "ifPossible",
              effect: {
                type: "playSelected",
                selection: "handSelection:play-from-hand",
                ignoreCost: true,
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:playSelected",
        "zone:hand",
        "filter:anyOf",
        "filter:name",
        "filter:type",
        "composition:selectThenPlay",
      ]),
    );
  });
});
