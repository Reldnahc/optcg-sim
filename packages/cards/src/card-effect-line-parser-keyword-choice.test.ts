import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses inline keyword alternatives as reusable choice options", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] If your Leader has the {Blackbeard Pirates} type, this Character gains [Double Attack], [Banish] or [Blocker] until the end of your opponent's next turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      condition: {
        type: "hasCardInZone",
        player: "self",
        zone: "leaderArea",
        filter: { typesAny: ["Blackbeard Pirates"] },
      },
      effect: {
        type: "choice",
        chooser: "self",
        min: 1,
        max: 1,
        options: [
          {
            id: "choice:keyword:1",
            effect: {
              type: "giveKeyword",
              target: { type: "self" },
              keyword: "doubleAttack",
              duration: { type: "untilEndOfNextTurn", player: "opponent" },
            },
          },
          {
            id: "choice:keyword:2",
            effect: {
              type: "giveKeyword",
              target: { type: "self" },
              keyword: "banish",
              duration: { type: "untilEndOfNextTurn", player: "opponent" },
            },
          },
          {
            id: "choice:keyword:3",
            effect: {
              type: "giveKeyword",
              target: { type: "self" },
              keyword: "blocker",
              duration: { type: "untilEndOfNextTurn", player: "opponent" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "marker:oncePerTurn",
      "expression:conditionalContinuous",
      "condition:leaderIdentity",
      "expression:choice",
      "choice:option",
      "instruction:giveKeyword",
      "target:thisCharacter",
      "keyword:anySupported",
      "duration:opponentNextEndPhase",
    ]),
  );
});

it("reuses inline keyword alternatives under another action entry point", () => {
  const result = parseCardEffectLine(
    "[On Play] This Character gains [Rush] or [Blocker] during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "choice",
        options: [
          {
            effect: {
              type: "giveKeyword",
              keyword: "rush",
              duration: { type: "thisTurn" },
            },
          },
          {
            effect: {
              type: "giveKeyword",
              keyword: "blocker",
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
});
