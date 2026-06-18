import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses selected opponent Characters with distributed power modifiers followed by K.O.", () => {
  const result = parseCardEffectLine(
    "[On Play] Select up to 2 of your opponent's Characters, and give 1 Character −3000 power and the other −2000 power until the end of your opponent's next turn. Then, K.O. up to 1 of your opponent's Characters with 3000 power or less.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
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
                  saveResultAs: "selected:distributed-power-targets",
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      min: 0,
                      max: 2,
                      filter: { categories: ["character"] },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "modifyPower",
                    value: -3000,
                    target: {
                      binding: {
                        saveResultAs: "selected:distributed-power-targets",
                        objectIndex: 0,
                      },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "modifyPower",
                    value: -2000,
                    target: {
                      binding: {
                        saveResultAs: "selected:distributed-power-targets",
                        objectIndex: 1,
                      },
                    },
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
                  saveResultAs: "selected:ko-target",
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      filter: {
                        categories: ["character"],
                        currentPower: { max: 3000 },
                      },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "ko",
                    target: {
                      type: "savedFieldObject",
                      binding: { saveResultAs: "selected:ko-target" },
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
      "entry:onPlay",
      "composition:selectThenApply",
      "instruction:selectTargets",
      "instruction:modifyPower",
      "instruction:ko",
      "filter:currentPower",
      "duration:opponentNextEndPhase",
    ]),
  );
});
