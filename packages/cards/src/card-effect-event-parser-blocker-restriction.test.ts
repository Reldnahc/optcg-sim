import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect event parser blocker restrictions", () => {
  it("parses costed Activate Main opponent Character Blocker activation restriction", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] DON!! −1: Up to 1 of your opponent's Characters cannot activate [Blocker] during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        oncePerTurn: true,
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "returnDon",
                  count: 1,
                  optional: true,
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    saveResultAs: "selected:thatCharacter",
                    effect: {
                      type: "selectTargets",
                      request: {
                        timing: "onResolution",
                        chooser: "self",
                        player: "opponent",
                        zone: "characterArea",
                        min: 0,
                        max: 1,
                        allowFewerIfUnavailable: true,
                        visibility: "public",
                        filter: { categories: ["character"] },
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "preventBlockerActivation",
                      duration: { type: "thisTurn" },
                    },
                  },
                ],
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
        "cost:returnDon",
        "instruction:preventBlockerActivation",
        "target:opponentCharacters",
        "duration:thisTurn",
        "activation:blocker",
        "composition:selectThenApply",
      ]),
    );
  });

  it("parses Main Event selected attacker power and Blocker activation restriction as saved-target primitives", () => {
    const result = parseCardEffectLine(
      "[Main] Select up to 1 of your {The Seven Warlords of the Sea} type Leader or Character cards and that card gains +2000 power during this turn. Then, if the selected card attacks during this turn, your opponent cannot activate [Blocker].",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "selected:blocker-restricted-attacker",
              effect: {
                type: "selectTargets",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "self",
                  zones: ["leaderArea", "characterArea"],
                  min: 0,
                  max: 1,
                  allowFewerIfUnavailable: true,
                  visibility: "public",
                  filter: {
                    categories: ["leader", "character"],
                    typesAny: ["The Seven Warlords of the Sea"],
                  },
                },
              },
            },
            {
              connector: "then",
              effect: {
                type: "modifyPower",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: "selected:blocker-restricted-attacker",
                  },
                  zones: ["leaderArea", "characterArea"],
                  player: "self",
                },
                value: 2000,
                duration: { type: "thisTurn" },
              },
            },
            {
              connector: "then",
              effect: {
                type: "preventBlockerActivation",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: "selected:blocker-restricted-attacker",
                  },
                  zones: ["leaderArea", "characterArea"],
                  player: "self",
                },
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventMain",
        "composition:selectThenApply",
        "target:yourLeaderOrCharacters",
        "filter:type",
        "filter:category:leader",
        "filter:category:character",
        "instruction:modifyPower",
        "modifier:positivePower",
        "duration:thisTurn",
        "instruction:preventBlockerActivation",
        "activation:blocker",
      ]),
    );
  });

  it("parses costed Main Event Leader attack Blocker restriction behind Life condition", () => {
    const result = parseCardEffectLine(
      "[Main] You may rest 1 of your DON!! cards: If you have 1 or less Life cards, your opponent cannot activate [Blocker] whenever your Leader attacks during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "restDon",
                  count: 1,
                  optional: true,
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "conditional",
                if: {
                  type: "lifeCount",
                  player: "self",
                  op: "lte",
                  value: 1,
                },
                then: {
                  type: "preventBlockerActivation",
                  target: { type: "myLeader" },
                  duration: { type: "thisTurn" },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventMain",
        "cost:restDon",
        "condition:lifeCount",
        "condition:comparator:lte",
        "instruction:preventBlockerActivation",
        "target:yourLeader",
        "duration:thisTurn",
        "activation:blocker",
      ]),
    );
  });
});
