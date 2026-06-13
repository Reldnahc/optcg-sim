import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses Counter effect negation over reusable Leader or Character targets with saved-reference power modifier", () => {
  const result = parseCardEffectLine(
    "[Counter] Negate the effect of up to 1 of your opponent's Leader or Character cards and give that card −4000 power during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "counter" },
      sourcePresencePolicy: "resolveFromDestinationZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:invalidate-effects-target",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zones: ["leaderArea", "characterArea"],
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter: { categories: ["leader", "character"] },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "invalidateEffects",
              target: {
                type: "savedFieldObject",
                zones: ["leaderArea", "characterArea"],
                player: "opponent",
              },
              duration: { type: "thisTurn" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "modifyPower",
              target: {
                type: "savedFieldObject",
                zones: ["leaderArea", "characterArea"],
                player: "opponent",
              },
              value: -4000,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventCounter",
      "instruction:invalidateEffects",
      "target:opponentLeaderOrCharacters",
      "filter:category:leader",
      "filter:category:character",
      "instruction:modifyPower",
      "modifier:negativePower",
      "duration:thisTurn",
      "composition:selectThenApply",
    ]),
  );
});

it("parses Trigger effect negation over the same reusable Leader or Character target primitive", () => {
  const result = parseCardEffectLine(
    "[Trigger] Negate the effect of up to 1 of your opponent's Leader or Character cards during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "trigger" },
      sourcePresencePolicy: "noSourceRequired",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectTargets",
              request: {
                zones: ["leaderArea", "characterArea"],
                filter: { categories: ["leader", "character"] },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "invalidateEffects",
              target: {
                type: "savedFieldObject",
                zones: ["leaderArea", "characterArea"],
                player: "opponent",
              },
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
});

it("parses Trigger effect negation for up to one opponent Leader and up to one Character independently", () => {
  const result = parseCardEffectLine(
    "[Trigger] Negate the effect of up to 1 of each of your opponent's Leader and Character cards during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "trigger" },
      sourcePresencePolicy: "noSourceRequired",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      zone: "leaderArea",
                      filter: { categories: ["leader"] },
                    },
                  },
                },
                {
                  effect: {
                    type: "invalidateEffects",
                    target: {
                      type: "savedFieldObject",
                      zone: "leaderArea",
                      player: "opponent",
                    },
                    duration: { type: "thisTurn" },
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      zone: "characterArea",
                      filter: { categories: ["character"] },
                    },
                  },
                },
                {
                  effect: {
                    type: "invalidateEffects",
                    target: {
                      type: "savedFieldObject",
                      zone: "characterArea",
                      player: "opponent",
                    },
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
      "entry:lifeTrigger",
      "instruction:invalidateEffects",
      "target:opponentLeader",
      "target:opponentCharacters",
      "duration:thisTurn",
      "composition:selectThenApply",
      "composition:sequence",
    ]),
  );
});

it("parses When Attacking negation over opponent Leader and all Characters as reusable invalidate effects", () => {
  const result = parseCardEffectLine(
    "[When Attacking] Negate the effects of your opponent's Leader and all of their Characters during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "whenAttacking" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "invalidateEffects",
              target: {
                type: "all",
                player: "opponent",
                zone: "leaderArea",
                filter: { categories: ["leader"] },
              },
              duration: { type: "thisTurn" },
            },
          },
          {
            connector: "always",
            effect: {
              type: "invalidateEffects",
              target: {
                type: "all",
                player: "opponent",
                zone: "characterArea",
                filter: { categories: ["character"] },
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
      "entry:whenAttacking",
      "instruction:invalidateEffects",
      "target:opponentLeader",
      "target:opponentCharacters",
      "cardinality:all",
      "duration:thisTurn",
      "composition:sequence",
    ]),
  );
});

it("parses Activate Main negation for selected Leader then selected Character attack restriction", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] If your Leader has the {Blackbeard Pirates} type and this Character was played on this turn, negate the effect of up to 1 of your opponent's Leader during this turn. Then, negate the effect of up to 1 of your opponent's Characters and that Character cannot attack until the end of your opponent's next turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      condition: {
        type: "and",
      },
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
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "leaderArea",
                      min: 0,
                      max: 1,
                      filter: { categories: ["leader"] },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "invalidateEffects",
                    duration: { type: "thisTurn" },
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      min: 0,
                      max: 1,
                      filter: { categories: ["character"] },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "invalidateEffects",
                    duration: {
                      type: "untilEndOfNextTurn",
                      player: "opponent",
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "cannotAttack",
                    duration: {
                      type: "untilEndOfNextTurn",
                      player: "opponent",
                    },
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
      "composition:conditionAnd",
      "instruction:invalidateEffects",
      "target:opponentLeader",
      "target:opponentCharacters",
      "instruction:preventActivation",
      "duration:thisTurn",
      "duration:opponentNextEndPhase",
      "composition:selectThenApply",
    ]),
  );
});
