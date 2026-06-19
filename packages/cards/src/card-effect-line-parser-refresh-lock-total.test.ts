import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses total rested Leader and Character refresh locks under On Play", () => {
  const result = parseCardEffectLine(
    "[On Play] Up to a total of 3 of your opponent's rested Leader and Character cards will not become active in your opponent's next Refresh Phase.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "cannotBecomeActive",
        target: {
          type: "chooseFromZones",
          request: {
            player: "opponent",
            zones: ["leaderArea", "characterArea"],
            min: 0,
            max: 3,
            filter: {
              categories: ["leader", "character"],
              state: "rested",
            },
          },
        },
        duration: { type: "untilStartOfNextTurn", player: "opponent" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:preventActivation",
      "cardinality:upTo",
      "target:opponentRestedCards",
      "zone:leaderArea",
      "zone:characterArea",
      "filter:category:leader",
      "filter:category:character",
      "filter:state:rested",
      "duration:opponentNextRefreshPhase",
    ]),
  );
});
