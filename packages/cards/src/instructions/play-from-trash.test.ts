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
            saveResultAs: "trashSelection:play",
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
              saveAs: "trashSelection:play",
              visibility: "bothPlayers",
            },
          },
          {
            id: "play:selected-from-trash",
            connector: "ifPossible",
            effect: {
              type: "playSelected",
              selection: "trashSelection:play",
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

  it("parses owned filtered play from trash wording through the same selection primitive", () => {
    expect(
      parsePlayFromTrashInstruction({
        text: "Play up to 1 of your {Egghead} type Character cards with a cost of 5 or less from your trash.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "trashSelection:play",
            effect: {
              type: "selectCards",
              zone: "trash",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                typesAny: ["Egghead"],
                cost: { max: 5 },
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "trashSelection:play",
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
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "composition:selectThenPlay",
      ],
      rest: "",
    });
  });

  it("parses exact named play from trash through the same selection primitive", () => {
    expect(
      parsePlayFromTrashInstruction({
        text: "Play 1 [Ice Oni] from your trash.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "trashSelection:play",
            effect: {
              type: "selectCards",
              zone: "trash",
              player: "self",
              chooser: "self",
              min: 1,
              max: 1,
              filter: { names: ["Ice Oni"] },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "trashSelection:play",
              ignoreCost: true,
            },
          },
        ],
      },
      evidence: [
        "instruction:playSelected",
        "cardinality:exact",
        "count:positiveInteger",
        "zone:trash",
        "player:self",
        "chooser:self",
        "filter:name",
        "composition:selectThenPlay",
      ],
      rest: "",
    });
  });

  it("parses independently quantified play selections sharing the trash source", () => {
    const result = parsePlayFromTrashInstruction({
      text: 'play up to 1 Character card with a type including "Baroque Works" and a cost of 4 or less and up to 1 Character card with a type including "Baroque Works" and a cost of 1 from your trash.',
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectCards",
              zone: "trash",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                typesIncludeAny: ["Baroque Works"],
                cost: { max: 4 },
              },
            },
          },
          { connector: "ifPossible", effect: { type: "playSelected" } },
          {
            connector: "then",
            effect: {
              type: "selectCards",
              zone: "trash",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                typesIncludeAny: ["Baroque Works"],
                cost: { op: "eq", value: 1 },
              },
            },
          },
          { connector: "ifPossible", effect: { type: "playSelected" } },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:playSelected",
        "cardinality:upTo",
        "zone:trash",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "composition:selectThenPlay",
        "expression:sequence",
      ]),
    );
  });
});
