import { describe, expect, it } from "vitest";

import { parsePlayFromTrashInstruction } from "./play-from-trash.js";

describe("play from trash instruction parser", () => {
  it("parses filtered multi-card play from trash as selection plus play primitives", () => {
    expect(
      parsePlayFromTrashInstruction({
        text: "play up to 5 {Five Elders} type Character cards with 5000 power and different card names from your trash.",
      }),
    ).toEqual({
      effect: {
        type: "sequence",
        effects: [
          {
            id: "select:trash-play",
            connector: "always",
            saveResultAs: "selected:trash-play",
            effect: {
              type: "selectCards",
              zone: "trash",
              player: "self",
              chooser: "self",
              min: 0,
              max: 5,
              filter: {
                categories: ["character"],
                typesAny: ["Five Elders"],
                power: { op: "eq", value: 5000 },
                custom: "differentNames",
              },
              saveAs: "selected:trash-play",
              visibility: "bothPlayers",
            },
          },
          {
            id: "play:selected-from-trash",
            connector: "ifPossible",
            effect: {
              type: "playSelected",
              selection: "selected:trash-play",
              ignoreCost: true,
            },
          },
        ],
      },
      evidence: [
        "instruction:playSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "zone:trash",
        "player:self",
        "chooser:self:upTo",
        "filter:type",
        "filter:category:character",
        "filter:power",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
        "filter:differentNames",
        "composition:selectThenPlay",
      ],
      rest: "",
    });
  });
});
