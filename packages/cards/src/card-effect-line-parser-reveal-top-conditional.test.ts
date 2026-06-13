import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses revealed-card condition into reveal, set selection, and DON movement primitives", () => {
  const result = parseCardEffectLine(
    "[On Play] Reveal 1 card from the top of your deck. If the revealed card has a cost of 2 or less, add up to 1 DON!! card from your DON!! deck and rest it.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "revealTop",
              player: "self",
              count: 1,
              visibility: "bothPlayers",
            },
          },
          {
            connector: "then",
            effect: {
              type: "selectFromSet",
              chooser: "self",
              min: 0,
              max: 1,
              filter: { cost: { max: 2 } },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "moveCards",
              min: 0,
              count: 1,
              from: { player: "self", zone: "donDeck", position: "top" },
              to: { player: "self", zone: "costArea" },
              destinationState: "rested",
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
      "instruction:selectFromSet",
      "filter:cost",
      "connector:ifPreviousSucceeded",
      "instruction:moveCards",
      "zone:donDeck",
      "state:rested",
    ]),
  );
});

it("reuses revealed-card condition with another supported body primitive", () => {
  const result = parseCardEffectLine(
    "[On Play] Reveal 1 card from the top of your deck. If that card has a cost of 3 or less, draw 1 card.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          { connector: "always", effect: { type: "revealTop" } },
          {
            connector: "then",
            effect: {
              type: "selectFromSet",
              filter: { cost: { max: 3 } },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
  });
});

it("parses revealed-card type-includes condition with composed draw and trash body", () => {
  const result = parseCardEffectLine(
    `[On Play] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", draw 2 cards and trash 1 card from your hand.`,
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          { connector: "always", effect: { type: "revealTop" } },
          {
            connector: "then",
            effect: {
              type: "selectFromSet",
              filter: { typesIncludeAny: ["Whitebeard Pirates"] },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "sequence",
              effects: [
                { effect: { type: "draw", player: "self", count: 2 } },
                {
                  effect: {
                    type: "trashFromHand",
                    player: "self",
                    chooser: "self",
                    count: 1,
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
      "instruction:revealTop",
      "instruction:selectFromSet",
      "filter:type",
      "instruction:draw",
      "instruction:trashFromHand",
      "connector:andOrdered",
    ]),
  );
});

it("parses reveal-top play with produced-character keyword continuation", () => {
  const result = parseCardEffectLine(
    `[Main] If your Leader's type includes "Whitebeard Pirates", reveal 1 card from the top of your deck. If that card is a Character card with a type including "Whitebeard Pirates" and a cost of 9 or less, you may play that card. If you do, that Character gains [Rush] during this turn.`,
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          typesIncludeAny: ["Whitebeard Pirates"],
        },
      },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "revealTop" } },
          {
            effect: {
              type: "selectFromSet",
              filter: {
                categories: ["character"],
                typesIncludeAny: ["Whitebeard Pirates"],
                cost: { max: 9 },
              },
            },
          },
          { connector: "ifPreviousSucceeded", effect: { type: "sequence" } },
        ],
      },
    },
  });
  if (result === undefined || !("block" in result)) {
    throw new Error("Expected parsed effect line.");
  }
  const effect = result.block.effect;
  if (effect.type !== "sequence") {
    throw new Error("Expected reveal sequence.");
  }
  const continuation = effect.effects[2]?.effect;
  if (continuation?.type !== "sequence") {
    throw new Error("Expected play and keyword continuation sequence.");
  }
  expect(continuation.effects.map((segment) => segment.effect.type)).toEqual([
    "playSelected",
    "giveKeyword",
  ]);
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:playSelected",
      "instruction:giveKeyword",
      "filter:cost",
      "filter:type",
    ]),
  );
});
