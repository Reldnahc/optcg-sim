import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";
import { supportedEntryPoints } from "./entry-points/supported.js";

it("parses with/without effect-entry-point filters for every supported bracket entry point", () => {
  for (const entryPoint of supportedEntryPoints) {
    for (const mode of ["with", "without"] as const) {
      const parsed = parseCardEffectLine(
        `[Activate: Main] up to 1 of your Characters ${mode} a ${entryPoint.text} effect gains [Rush] during this turn.`,
      );

      expect(parsed, `${mode} ${entryPoint.text}`).toMatchObject({
        block: {
          category: "activate",
          trigger: { type: "activateMain" },
          effect: {
            type: "giveKeyword",
            target: {
              type: "choose",
              request: {
                player: "self",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  effectEntryPoint: {
                    mode,
                    trigger: entryPoint.trigger,
                    ...(entryPoint.condition === undefined
                      ? {}
                      : { condition: entryPoint.condition }),
                  },
                },
              },
            },
            keyword: "rush",
            duration: { type: "thisTurn" },
          },
        },
      });
      expect(parsed?.evidence).toEqual(
        expect.arrayContaining([
          "filter:effectEntryPoint",
          mode === "with"
            ? "filter:effectEntryPoint:with"
            : "filter:effectEntryPoint:without",
          "instruction:giveKeyword",
          "keyword:anySupported",
          "duration:thisTurn",
        ]),
      );
    }
  }
});

it("parses rest-self cost, power debuff, and filtered temporary keyword grant as reusable sequence parts", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] You may rest this Leader: Give up to 1 of your opponent's Characters -2000 power during this turn. Then, up to 1 of your Characters without a [When Attacking] effect gains [Rush] during this turn.",
    ),
  ).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: { type: "payCost", cost: { type: "restSelf" } },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "modifyPower",
                    value: -2000,
                    duration: { type: "thisTurn" },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "giveKeyword",
                    keyword: "rush",
                    duration: { type: "thisTurn" },
                    target: {
                      type: "choose",
                      request: {
                        player: "self",
                        zone: "characterArea",
                        min: 0,
                        max: 1,
                        filter: {
                          categories: ["character"],
                          effectEntryPoint: {
                            mode: "without",
                            trigger: { type: "whenAttacking" },
                          },
                        },
                      },
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
});
