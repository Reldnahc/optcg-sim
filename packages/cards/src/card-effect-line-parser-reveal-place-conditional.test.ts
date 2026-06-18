import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses reveal place top-or-bottom then type condition into reusable primitives", () => {
  const result = parseCardEffectLine(
    '[On Play] Reveal 1 card from the top of your deck and place it at the top or bottom of your deck. If the revealed card\'s type includes "Whitebeard Pirates", this Character gains [Rush] during this turn.',
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "revealTop",
              player: "self",
              count: 1,
              saveAs: "set:revealed-top-conditional",
              visibility: "bothPlayers",
            },
          },
          {
            effect: {
              type: "placeSetRemainder",
              set: "set:revealed-top-conditional",
              owner: "self",
              destination: "deck",
              position: "topOrBottom",
              order: "chooser",
            },
          },
          {
            effect: {
              type: "conditional",
              if: {
                type: "cardMatches",
                target: {
                  type: "savedSelectedCard",
                  selection: "set:revealed-top-conditional",
                  onFailure: "failClosed",
                },
                filter: { typesIncludeAny: ["Whitebeard Pirates"] },
              },
              then: {
                type: "giveKeyword",
                keyword: "rush",
                target: { type: "self" },
                duration: { type: "thisTurn" },
              },
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
      "instruction:placeSetRemainder",
      "position:top",
      "position:bottom",
      "order:anyOrder",
      "condition:cardMatches",
      "filter:type",
      "instruction:giveKeyword",
    ]),
  );
});

it("reuses reveal place condition under another entry point and body", () => {
  const result = parseCardEffectLine(
    '[Main] Reveal 1 card from the top of your deck and place it at the top or bottom of your deck. If the revealed card\'s type includes "Example", draw 1 card.',
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "revealTop" } },
          { effect: { type: "placeSetRemainder" } },
          {
            effect: {
              type: "conditional",
              if: {
                type: "cardMatches",
                target: { type: "savedSelectedCard" },
              },
              then: { type: "draw", player: "self", count: 1 },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventMain",
      "instruction:revealTop",
      "instruction:placeSetRemainder",
      "condition:cardMatches",
      "instruction:draw",
    ]),
  );
});
