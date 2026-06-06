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
