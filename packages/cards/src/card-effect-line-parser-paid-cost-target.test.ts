import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses blocker restrictions against the card selected by an attach-DON cost", () => {
  const result = parseCardEffectLine(
    "[Main] You may give 2 active DON!! cards to 1 of your [Silvers Rayleigh]: Your opponent cannot activate [Blocker] when the card given these DON!! cards attacks during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "attachDon",
                count: 2,
                sourcePlayer: "self",
                sourceState: "active",
                target: {
                  type: "chooseFromZones",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "self",
                    zones: ["leaderArea", "characterArea"],
                    min: 1,
                    max: 1,
                    allowFewerIfUnavailable: false,
                    visibility: "public",
                    filter: { names: ["Silvers Rayleigh"] },
                  },
                },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "preventBlockerActivation",
              target: {
                type: "savedFieldObject",
                binding: { family: "paidCost", saveResultAs: "paidCost" },
                zones: ["leaderArea", "characterArea"],
                player: "self",
                visibility: "publicOnly",
                onFailure: "failClosed",
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
      "composition:optionalCostedEffect",
      "cost:attachDon",
      "target:yourDonCards",
      "target:yourNamedCards",
      "reference:paidCost",
      "instruction:preventBlockerActivation",
      "activation:blocker",
      "duration:thisTurn",
    ]),
  );
});
