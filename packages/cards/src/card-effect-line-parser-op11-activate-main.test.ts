import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP11 Activate Main parser primitives", () => {
  it("parses conditional rest-self plus Life face-down costs before KO bodies", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] If your Leader is [Shirahoshi], you may rest this Character and turn 1 card from the top of your Life cards face-down: K.O. up to 1 of your opponent's Characters with a cost of 3 or less.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        condition: {
          type: "hasCardInZone",
          player: "self",
          zone: "leaderArea",
          filter: { names: ["Shirahoshi"] },
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "sequence",
                  optional: true,
                  costs: [
                    { type: "restSelf" },
                    {
                      type: "setLifeFaceUp",
                      count: 1,
                      player: "self",
                      position: "top",
                      faceUp: false,
                    },
                  ],
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: { type: "sequence" },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:activateMain",
        "condition:leaderIdentity",
        "composition:conditionalCostedEffect",
        "composition:optionalCostedEffect",
        "composition:costSequence",
        "cost:restSelf",
        "cost:setLifeFaceUp",
        "instruction:ko",
      ]),
    );
  });

  it("parses conditional Life face-down costs before delayed self-activation bodies", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] If your Leader is [Shirahoshi], you may turn 1 card from the top of your Life cards face-down: Set this Character as active at the end of this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        oncePerTurn: true,
        condition: {
          type: "hasCardInZone",
          player: "self",
          zone: "leaderArea",
          filter: { names: ["Shirahoshi"] },
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "setLifeFaceUp",
                  count: 1,
                  player: "self",
                  position: "top",
                  faceUp: false,
                  optional: true,
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "delayed",
                timing: { type: "endOfTurn", turn: "current" },
                effect: {
                  type: "activate",
                  target: { type: "self" },
                },
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
        "condition:leaderIdentity",
        "cost:setLifeFaceUp",
        "instruction:activate",
        "duration:endOfTurn",
        "composition:delayed",
      ]),
    );
  });
});
