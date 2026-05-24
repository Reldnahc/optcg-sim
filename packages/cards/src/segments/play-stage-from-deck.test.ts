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
              type: "search",
              request: {
                zone: "deck",
                player: "self",
                filter: {
                  categories: ["stage"],
                  typesAny: ["Mary Geoise"],
                },
                min: 0,
                max: 1,
                destination: "stageArea",
                revealTo: "chooserOnly",
                shuffleAfter: false,
              },
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
    expect(result?.evidence).toContain("instruction:search");
    expect(result?.evidence).toContain("instruction:playSelected");
    expect(result?.evidence).toContain("filter:type");
    expect(result?.evidence).toContain("filter:category:stage");
    expect(result?.evidence).toContain("destination:stageArea");
  });
});
