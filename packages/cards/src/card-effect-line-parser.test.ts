import { describe, expect, it } from "vitest";

import {
  parseCardEffectLine,
  parseCardEffectLineDetailed,
} from "./card-effect-line-parser.js";

describe("card effect line parser", () => {
  it("parses supported entry, marker, and composed draw/trash instructions", () => {
    expect(
      parseCardEffectLine(
        "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
      ),
    ).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        oncePerTurn: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", count: 2, player: "self" },
            },
            {
              connector: "then",
              effect: {
                type: "trashFromHand",
                count: 1,
                player: "self",
                chooser: "self",
              },
            },
          ],
        },
      },
    });
  });

  it("parses simple On Play draw through the default parser set", () => {
    expect(parseCardEffectLine("[On Play] Draw 1 card.")).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: { type: "draw", count: 1, player: "self" },
      },
      evidence: [
        "entry:onPlay",
        "sourcePresence:mustRemain",
        "instruction:draw",
        "count:positiveInteger",
        "player:self",
        "composition:entryExpression",
      ],
    });
  });

  it("parses On K.O. trash through the same instruction parser", () => {
    expect(
      parseCardEffectLine("[On K.O.] Trash 1 card from your hand."),
    ).toMatchObject({
      block: {
        trigger: { type: "onKO" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "trashFromHand",
          count: 1,
          player: "self",
          chooser: "self",
        },
      },
    });
  });

  it("recognizes unsupported entry points without marking them supported", () => {
    const result = parseCardEffectLine("[On Block] Draw 1 card.");

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onBlock" },
      },
    });
    expect(result?.evidence).toContain("entry:onBlock");
    expect(result?.evidence).toContain("entrySupport:unsupported");
    expect(result?.evidence).toContain("instruction:draw");
  });

  it("parses planned field primitives through composition instead of a full-line template", () => {
    const result = parseCardEffectLine(
      "[On Play] Rest up to 1 of your opponent's Characters and that Character will not become active in your opponent's next Refresh Phase. Then, if your opponent has 2 or more rested Characters, your Leader gains +2000 power until the end of your opponent's next End Phase.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: {
                      type: "custom",
                      handler: "planned:restOpponentCharacters",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "custom",
                      handler:
                        "planned:preventThatCharacterOpponentNextRefresh",
                    },
                  },
                ],
              },
            },
            {
              connector: "then",
              effect: {
                type: "conditional",
                if: {
                  type: "fieldCount",
                  player: "opponent",
                  filter: {
                    categories: ["character"],
                    state: "rested",
                  },
                  op: "gte",
                  value: 2,
                },
                then: {
                  type: "custom",
                  handler: "planned:yourLeaderPowerOpponentNextEnd",
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toContain("instructionSupport:planned");
    expect(result?.evidence).toContain("instruction:rest");
    expect(result?.evidence).toContain("instruction:preventActivation");
    expect(result?.evidence).toContain("condition:opponentFieldCount");
    expect(result?.evidence).toContain("instruction:modifyPower");
  });

  it("fails closed for unknown entry points", () => {
    expect(parseCardEffectLine("[Unknown] Draw 1 card.")).toBeUndefined();
  });

  it("reports entry-point failures", () => {
    expect(parseCardEffectLineDetailed("[Unknown] Draw 1 card.")).toEqual({
      ok: false,
      diagnostic: {
        stage: "entryPoint",
        reason: "no entry-point parser matched",
        text: "[Unknown] Draw 1 card.",
      },
    });
  });

  it("reports expression failures after entry and marker parsing", () => {
    expect(
      parseCardEffectLineDetailed(
        "[When Attacking] [Once Per Turn] unsupported body.",
      ),
    ).toEqual({
      ok: false,
      diagnostic: {
        stage: "expression",
        reason: "no expression parser matched",
        text: "unsupported body.",
      },
    });
  });
});
