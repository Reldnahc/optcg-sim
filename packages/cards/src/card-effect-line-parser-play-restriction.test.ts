import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser play restriction composition", () => {
  it("parses On Play hand play into a same-turn Character play restriction", () => {
    expect(
      parseCardEffectLine(
        "[On Play] Play up to 1 {Alabasta} or {Straw Hat Crew} type Character card with a cost of 5 or less from your hand. Then, you cannot play any Character cards on your field during this turn.",
      ),
    ).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    saveResultAs: "handSelection:play-from-hand",
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        typesAny: ["Alabasta", "Straw Hat Crew"],
                        cost: { max: 5 },
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
            {
              connector: "then",
              effect: {
                type: "preventPlay",
                player: "self",
                filter: { categories: ["character"] },
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
      evidence: [
        "entry:onPlay",
        "sourcePresence:mustRemain",
        "expression:sequence",
        "instruction:playSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "zone:hand",
        "player:self",
        "chooser:self:upTo",
        "filter:type",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "composition:selectThenPlay",
        "connector:then",
        "instruction:preventPlay",
        "player:self",
        "zone:hand",
        "duration:thisTurn",
        "filter:category:character",
        "composition:entryExpression",
      ],
    });
  });
});
