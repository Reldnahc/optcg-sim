import { describe, expect, it } from "vitest";

import { parsePlayFromHandInstruction } from "./play-from-hand.js";

describe("play from hand instruction parser", () => {
  it("parses play from hand as source-zone plus shared predicates", () => {
    expect(
      parsePlayFromHandInstruction({
        text: "Play up to 1 black {Five Elders} type Character card with a cost equal to or less than the number of DON!! cards on your field from your hand.",
      }),
    ).toMatchObject({
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
                colorsAny: ["black"],
                categories: ["character"],
                typesAny: ["Five Elders"],
                custom: "costLteSelfDonFieldCount",
              },
              saveAs: "handSelection:play-from-hand",
              visibility: "chooserOnly",
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
      evidence: [
        "instruction:playSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "zone:hand",
        "player:self",
        "chooser:self:upTo",
        "filter:color",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "valueSource:donFieldCount:self",
        "composition:selectThenPlay",
      ],
      rest: "",
    });
  });

  it("parses play from hand rested as reusable play-selected entry state", () => {
    expect(
      parsePlayFromHandInstruction({
        text: "Play up to 1 Character card with a cost of 5 or less from your hand rested.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                cost: { max: 5 },
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
              enterRested: true,
            },
          },
        ],
      },
      evidence: [
        "instruction:playSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "zone:hand",
        "player:self",
        "chooser:self:upTo",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "state:rested",
        "composition:selectThenPlay",
      ],
      rest: "",
    });
  });
});
