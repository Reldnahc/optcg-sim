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
