import { describe, expect, it } from "vitest";

import { playStageFromDeckExpressionParser } from "./play-stage-from-deck.js";

describe("play stage from deck expression parser", () => {
  it("composes stage search and play-selected without deck-rule authority", () => {
    const result = playStageFromDeckExpressionParser({
      text: "play up to 1 {Mary Geoise} type Stage card from your deck.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectCards",
              zone: "deck",
              player: "self",
              chooser: "self",
              filter: {
                categories: ["stage"],
                typesAny: ["Mary Geoise"],
              },
              min: 0,
              max: 1,
              saveAs: "selected:start-of-game",
              visibility: "chooserOnly",
            },
          },
          {
            connector: "always",
            effect: {
              type: "playSelected",
              selection: "selected:start-of-game",
              ignoreCost: true,
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toContain("instruction:selectCards");
    expect(result?.evidence).toContain("instruction:playSelected");
    expect(result?.evidence).toContain("filter:type");
    expect(result?.evidence).toContain("filter:category:stage");
    expect(result?.evidence).toContain("destination:stageArea");
  });
});
