import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP12 delayed battle parser support", () => {
  it("parses a DON-gated Activate Main into an event-timed delayed sequence", () => {
    const result = parseCardEffectLine(
      "[DON!! x3] [Activate: Main] [Once Per Turn] If this Leader battles your opponent's Character during this turn, set this Leader as active. Then, this Leader cannot attack your opponent's Characters with a base cost of 7 or less during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        oncePerTurn: true,
        condition: { type: "attachedDonCount", op: "gte", value: 3 },
        effect: {
          type: "delayed",
          timing: {
            type: "event",
            trigger: {
              type: "attackDeclared",
              role: "attacker",
              player: "self",
              filter: { categories: ["leader"] },
              targetPlayer: "opponent",
              targetFilter: { categories: ["character"] },
            },
            expires: { type: "endOfTurn", turn: "current" },
          },
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "activate",
                  target: { type: "myLeader" },
                },
              },
              {
                connector: "then",
                effect: {
                  type: "cannotAttackTarget",
                  target: { type: "myLeader" },
                  attackTarget: {
                    player: "opponent",
                    zone: "characterArea",
                    filter: {
                      categories: ["character"],
                      baseCost: { max: 7 },
                    },
                  },
                  duration: { type: "thisTurn" },
                },
              },
            ],
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "entry:activateMain",
        "marker:oncePerTurn",
        "composition:delayed",
        "trigger:attackDeclared",
        "instruction:activate",
        "target:yourLeader",
        "instruction:cannotAttackTarget",
        "filter:cost",
        "duration:thisTurn",
      ]),
    );
  });
});
