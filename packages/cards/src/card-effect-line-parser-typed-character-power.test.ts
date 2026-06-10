import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses Main rest-DON cost into typed self Character power gain", () => {
  const result = parseCardEffectLine(
    "[Main] You may rest 3 of your DON!! cards: Up to 3 of your {Admiral} type Characters gain +2000 power during this turn.",
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
            effect: {
              type: "payCost",
              cost: {
                type: "restDon",
                count: 3,
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              target: {
                type: "choose",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "self",
                  zone: "characterArea",
                  min: 0,
                  max: 3,
                  allowFewerIfUnavailable: true,
                  visibility: "public",
                  filter: {
                    categories: ["character"],
                    typesAny: ["Admiral"],
                  },
                },
              },
              value: 2000,
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
      "cost:restDon",
      "instruction:modifyPower",
      "target:yourCharacters",
      "filter:type",
      "filter:category:character",
      "modifier:positivePower",
      "duration:thisTurn",
    ]),
  );
});
