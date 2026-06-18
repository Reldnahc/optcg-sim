import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses targeted keyword grants to your Leader or Character cards through the shared target set", () => {
  const result = parseCardEffectLine(
    "[On Play] Up to 1 of your Leader or Character cards gains [Banish] during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "giveKeyword",
        keyword: "banish",
        duration: { type: "thisTurn" },
        target: {
          type: "chooseFromZones",
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
            },
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:giveKeyword",
      "cardinality:upTo",
      "target:yourLeaderOrCharacters",
      "filter:category:leader",
      "filter:category:character",
      "keyword:anySupported",
      "duration:thisTurn",
    ]),
  );
});
