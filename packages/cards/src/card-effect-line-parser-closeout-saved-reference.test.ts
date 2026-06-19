import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("closeout saved-reference parser variants", () => {
  it("parses conditional additional power on the saved selected target", () => {
    const result = parseCardEffectLine(
      "[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, if you have 2 or less Life cards, that card gains an additional +2000 power.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "counter" },
        effect: {
          type: "sequence",
          effects: [
            {
              saveResultAs: "selected:power-continuation-target",
              effect: { type: "selectTargets" },
            },
            {
              effect: {
                type: "modifyPower",
                value: 2000,
                duration: { type: "thisBattle" },
              },
            },
            {
              effect: {
                type: "conditional",
                if: { type: "lifeCount", player: "self", op: "lte", value: 2 },
                then: {
                  type: "modifyPower",
                  value: 2000,
                  duration: { type: "thisBattle" },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:selectThenApply",
        "expression:conditional",
        "condition:lifeCount",
        "instruction:modifyPower",
        "target:selectedCharacter",
      ]),
    );
  });

  it("parses selected Character attack restriction as a saved-target follow-up", () => {
    const result = parseCardEffectLine(
      "[On Play] If your Leader has the {Baroque Works} type, select up to 1 of your opponent's Characters with a cost of 4 or less. The selected Character cannot attack until the end of your opponent's next turn.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        condition: {
          type: "hasCardInZone",
          player: "self",
          zone: "leaderArea",
          filter: {
            categories: ["leader"],
            typesAny: ["Baroque Works"],
          },
        },
        effect: {
          type: "sequence",
          effects: [
            {
              saveResultAs: "selected:attack-restriction-target",
              effect: { type: "selectTargets" },
            },
            {
              effect: {
                type: "cannotAttack",
                target: {
                  binding: {
                    saveResultAs: "selected:attack-restriction-target",
                  },
                },
                duration: { type: "untilEndOfNextTurn", player: "opponent" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "expression:conditional",
        "condition:leaderIdentity",
        "filter:type",
        "composition:selectThenApply",
        "instruction:selectTargets",
        "instruction:preventActivation",
        "target:selectedCharacter",
        "duration:opponentNextEndPhase",
      ]),
    );
  });
});
