import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect event parser blocker restrictions", () => {
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
});
