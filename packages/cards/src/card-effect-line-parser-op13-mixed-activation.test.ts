import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses this-Character-or-DON activation as an effect choice", () => {
  const result = parseCardEffectLine(
    "[End of Your Turn] Set this Character or up to 1 of your DON!! cards as active.",
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
            effect: {
              type: "choice",
              chooser: "self",
              min: 1,
              max: 1,
              options: [
                {
                  id: "choice:activate-this-character",
                  effect: {
                    type: "activate",
                    target: { type: "self" },
                  },
                },
                {
                  id: "choice:activate-don",
                  effect: {
                    type: "sequence",
                    effects: [
                      {
                        effect: {
                          type: "selectTargets",
                          request: {
                            player: "self",
                            zone: "costArea",
                            max: 1,
                            filter: { categories: ["don"], state: "rested" },
                          },
                        },
                      },
                      {
                        effect: {
                          type: "activate",
                          target: { type: "savedFieldObject" },
                        },
                      },
                    ],
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
      "entry:endOfYourTurn",
      "instruction:activate",
      "target:thisCharacter",
      "target:yourDonCards",
      "zone:costArea",
      "filter:category:don",
      "filter:state:rested",
      "composition:chooseOne",
      "composition:selectThenApply",
    ]),
  );
});
