import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses end-of-your-turn as a reusable auto entry around DON activation", () => {
  const result = parseCardEffectLine(
    "[End of Your Turn] Set up to 1 of your DON!! cards as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "endOfYourTurn" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                zone: "costArea",
                player: "self",
                filter: { categories: ["don"], state: "rested" },
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "activate",
              target: {
                type: "savedFieldObject",
                zone: "costArea",
                player: "self",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:endOfYourTurn",
      "sourcePresence:mustRemain",
      "instruction:activate",
      "composition:selectThenApply",
    ]),
  );
  expect(result?.evidence).not.toContain("entrySupport:unsupported");
});
