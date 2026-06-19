import { describe, expect, it } from "vitest";

import { parseCardEffectLinesDetailed } from "./card-effect-line-parser.js";

const op11NamiLines = [
  "[Your Turn] [Once Per Turn] This effect can be activated when a card is removed from your or your opponent's Life cards. If you have 7 or less cards in your hand, draw 1 card.",
  "[DON!!×1] [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your hand: This Leader gains +2000 power during this turn.",
] as const;

describe("OP11 Nami leader parser", () => {
  it("parses life-removal activation and opponent-attack leader power into reusable primitives", () => {
    const parsed = op11NamiLines.map((line) =>
      parseCardEffectLinesDetailed(line),
    );

    for (const result of parsed) {
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.diagnostic.reason);
      }
    }
    const values = parsed.flatMap((result) => (result.ok ? result.value : []));
    expect(values).toHaveLength(2);
    expect(values[0]).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
        oncePerTurn: true,
        condition: { type: "yourTurn" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "conditional",
                if: { type: "handCount", player: "self", op: "lte", value: 7 },
                then: { type: "draw", player: "self", count: 1 },
              },
            },
          ],
        },
      },
    });
    expect(values[1]).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onOpponentAttack" },
        oncePerTurn: true,
        condition: {
          type: "attachedDonCount",
          target: { type: "self" },
          op: "gte",
          value: 1,
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "paidCost:trashFromHand",
              effect: {
                type: "payCost",
                cost: {
                  type: "trashFromHand",
                  count: 1,
                  chooser: "self",
                  optional: true,
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "modifyPower",
                target: { type: "myLeader" },
                value: 2000,
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    });
    expect(values[0]?.evidence).toEqual(
      expect.arrayContaining([
        "entry:yourTurn",
        "activation:reaction",
        "trigger:lifeRemoved",
        "player:self",
        "player:opponent",
        "condition:handCount",
        "instruction:draw",
      ]),
    );
    expect(values[1]?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "condition:attachedDonCount",
        "entry:onOpponentAttack",
        "marker:oncePerTurn",
        "composition:optionalCostedEffect",
        "cost:trashFromHand",
        "target:yourLeader",
        "instruction:modifyPower",
        "duration:thisTurn",
      ]),
    );
  });
});
