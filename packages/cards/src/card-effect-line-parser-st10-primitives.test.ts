import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses activate-main DON ramp with reusable shared-subject OR DON count condition", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] If you have 0 DON!! cards on your field or 8 or more DON!! cards on your field, add up to 1 DON!! card from your DON!! deck and set it as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      sourcePresencePolicy: "mustRemainInSameZone",
      condition: {
        type: "or",
        conditions: [
          { type: "fieldCount", player: "self", op: "eq", value: 0 },
          { type: "fieldCount", player: "self", op: "gte", value: 8 },
        ],
      },
      effect: {
        type: "moveCards",
        min: 0,
        count: 1,
        from: { player: "self", zone: "donDeck", position: "top" },
        to: { player: "self", zone: "costArea" },
        order: "original",
        destinationState: "active",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "marker:oncePerTurn",
      "composition:conditionOr",
      "condition:donFieldCount",
      "condition:threshold:nonNegativeInteger",
      "condition:threshold:positiveInteger",
      "instruction:moveCards",
      "zone:donDeck",
      "destination:costArea",
      "state:active",
    ]),
  );
});

it("parses opponent blocker activation reactions with reusable K.O. body primitives", () => {
  const result = parseCardEffectLine(
    "[Once Per Turn] When your opponent activates a [Blocker], K.O. up to 1 of your opponent's Characters with 8000 power or less.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: {
        type: "opponentActivated",
        activations: ["blocker"],
      },
      oncePerTurn: true,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  currentPower: { max: 8000 },
                },
              },
            },
          },
          { connector: "then", effect: { type: "ko" } },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitReaction",
      "marker:oncePerTurn",
      "trigger:opponentActivated",
      "activation:blocker",
      "instruction:ko",
      "filter:currentPower",
      "condition:comparator:lte",
    ]),
  );
});
