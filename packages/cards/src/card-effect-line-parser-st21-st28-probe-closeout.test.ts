import { describe, expect, it } from "vitest";

import {
  parseCardEffectLine,
  parseCardEffectLines,
} from "./card-effect-line-parser.js";
import type { ParsedEffectLine, ParsedRuntimeEffectLine } from "./types.js";

const expectEffectLine = (
  line: ParsedEffectLine | undefined,
): ParsedRuntimeEffectLine => {
  if (line === undefined || line.kind === "metadata") {
    throw new Error("Expected parsed runtime effect line.");
  }
  return line;
};

describe("ST21-ST28 support probe closeout parser coverage", () => {
  it("parses selected Character attack blocker restriction without a power modifier", () => {
    const result = expectEffectLine(
      parseCardEffectLine(
        "[On Play] Select up to 1 of your {Straw Hat Crew} type Characters with 6000 power or more. If the selected Character attacks during this turn, your opponent cannot activate [Blocker].",
      ),
    );

    expect(result.block).toMatchObject({
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "selected:blocker-restricted-attacker",
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  typesAny: ["Straw Hat Crew"],
                  currentPower: { min: 6000 },
                },
              },
            },
          },
          {
            effect: {
              type: "preventBlockerActivation",
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "composition:selectThenApply",
        "target:yourCharacters",
        "filter:type",
        "filter:currentPower",
        "instruction:preventBlockerActivation",
        "activation:blocker",
      ]),
    );
  });

  it("parses reveal-from-hand cost into draw and topdeck revealed-card cleanup", () => {
    const result = expectEffectLine(
      parseCardEffectLine(
        '[Activate: Main] [Once Per Turn] You may reveal 1 card with a type including "Whitebeard Pirates" from your hand: Draw 1 card and place the revealed card at the top of your deck.',
      ),
    );

    expect(result.block).toMatchObject({
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: {
                type: "revealFromHand",
                count: 1,
                filter: { typesIncludeAny: ["Whitebeard Pirates"] },
              },
            },
          },
          {
            effect: {
              type: "sequence",
              effects: [
                { effect: { type: "draw", count: 1 } },
                {
                  effect: {
                    type: "moveSelected",
                    selection: "paidCost",
                    from: "currentZone",
                    to: "deck",
                    position: "top",
                  },
                },
              ],
            },
          },
        ],
      },
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "entry:activateMain",
        "marker:oncePerTurn",
        "cost:revealFromHand",
        "filter:type",
        "instruction:draw",
        "instruction:moveSelected",
        "destination:deck",
        "position:top",
      ]),
    );
  });

  it("parses all matching named Characters returned to owner hand", () => {
    const result = expectEffectLine(
      parseCardEffectLine(
        "[On Play] Return all of your [San-Gorou] and [Sanji] Characters to the owner's hand.",
      ),
    );

    expect(result.block).toMatchObject({
      trigger: { type: "onPlay" },
      effect: {
        type: "bounce",
        destination: "hand",
        target: {
          type: "all",
          player: "self",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            names: ["San-Gorou", "Sanji"],
          },
        },
      },
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:returnToOwnerHand",
        "cardinality:all",
        "player:self",
        "filter:name",
        "destination:ownerHand",
      ]),
    );
  });

  it("parses multientry return-DON cost into typed leader base-power duration", () => {
    const results = parseCardEffectLines(
      "[On Play]/[When Attacking] DON!! −2 (You may return the specified number of DON!! cards from your field to your DON!! deck.): If your Leader is multicolored and your opponent has 5 or more DON!! cards on their field, your {Straw Hat Crew} type Leader's base power becomes 7000 until the end of your opponent's next End Phase.",
    );
    const result = expectEffectLine(results[0]);

    expect(results.map((parsed) => parsed.block.trigger)).toEqual([
      { type: "onPlay" },
      { type: "whenAttacking" },
    ]);

    expect(result.block).toMatchObject({
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: { type: "payCost", cost: { type: "returnDon", count: 2 } },
          },
          {
            effect: {
              type: "conditional",
              then: {
                type: "conditional",
                if: {
                  type: "hasCardInZone",
                  zone: "leaderArea",
                  player: "self",
                  filter: {
                    categories: ["leader"],
                    typesAny: ["Straw Hat Crew"],
                  },
                },
                then: {
                  type: "setBasePower",
                  target: { type: "myLeader" },
                  value: 7000,
                  duration: { type: "untilEndOfNextTurn", player: "opponent" },
                },
              },
            },
          },
        ],
      },
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "cost:returnDon",
        "condition:leaderColorCount",
        "condition:leaderIdentity",
        "condition:donFieldCount",
        "instruction:setBasePower",
        "filter:type",
        "duration:opponentNextEndPhase",
      ]),
    );
    expect(expectEffectLine(results[1]).evidence).toEqual(
      expect.arrayContaining([
        "entry:whenAttacking",
        "cost:returnDon",
        "instruction:setBasePower",
      ]),
    );
  });

  it("parses return currently-given DON cost into keyword and power gain", () => {
    const result = expectEffectLine(
      parseCardEffectLine(
        "[Activate: Main] [Once Per Turn] You may return 2 total of your currently given DON!! cards to your cost area rested: This Character gains [Rush] and +1000 power during this turn.",
      ),
    );

    expect(result.block).toMatchObject({
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 2,
                from: { player: "self", zone: "costArea" },
                to: { player: "self", zone: "costArea" },
                filter: { categories: ["don"], state: "attached" },
                destinationState: "rested",
              },
            },
          },
          {
            effect: {
              type: "sequence",
              effects: [
                { effect: { type: "giveKeyword", keyword: "rush" } },
                { effect: { type: "modifyPower", value: 1000 } },
              ],
            },
          },
        ],
      },
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "entry:activateMain",
        "marker:oncePerTurn",
        "cost:moveCards",
        "zone:costArea",
        "filter:state:attached",
        "destination:costArea",
        "state:rested",
        "instruction:giveKeyword",
        "instruction:modifyPower",
      ]),
    );
  });
});
