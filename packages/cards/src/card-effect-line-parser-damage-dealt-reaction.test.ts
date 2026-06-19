import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("damage-dealt reaction parser primitives", () => {
  it("parses attack damage dealt reactions through reusable damage predicates", () => {
    const characterResult = parseCardEffectLine(
      "[DON!! x1] When this Character's attack deals damage to your opponent's Life, you may trash 7 cards from the top of your deck.",
    );
    const leaderResult = parseCardEffectLine(
      "[DON!! x1] When this Leader's attack deals damage to your opponent's Life, you may trash 1 card from the top of your deck.",
    );

    for (const result of [characterResult, leaderResult]) {
      expect(result).toMatchObject({
        block: {
          category: "auto",
          trigger: {
            type: "damageDealt",
            players: ["opponent"],
            attacker: "self",
          },
          condition: {
            type: "attachedDonCount",
            target: { type: "self" },
            op: "gte",
            value: 1,
          },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      });
      expect(result?.evidence).toEqual(
        expect.arrayContaining([
          "marker:attachedDon",
          "trigger:damageDealt",
          "player:opponent",
          "attacker:self",
          "instruction:moveCards",
          "composition:optionalActionEffect",
        ]),
      );
    }
  });

  it("parses player damage dealt reactions without binding them to one body", () => {
    const result = parseCardEffectLine(
      "When you deal damage to your opponent's Life, you may trash 3 cards from the top of your deck. If you do, trash this Character.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "damageDealt", players: ["opponent"] },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: { type: "sequence" },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:damageDealt",
        "player:opponent",
        "cost:moveCards",
        "instruction:trash",
        "target:thisCharacter",
        "composition:optionalCostedEffect",
      ]),
    );
  });
});
