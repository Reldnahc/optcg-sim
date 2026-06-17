import { expect, test } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

test("parses Trigger Leader power through self next turn end using shared duration support", () => {
  const result = parseCardEffectLine(
    "[Trigger] Up to 1 of your Leader gains +1000 power until the end of your next turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "trigger" },
      sourcePresencePolicy: "noSourceRequired",
      effect: {
        type: "modifyPower",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zones: ["leaderArea"],
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: { categories: ["leader"] },
          },
        },
        value: 1000,
        duration: { type: "untilEndOfNextTurn", player: "self" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:lifeTrigger",
      "instruction:modifyPower",
      "target:yourLeader",
      "cardinality:upTo",
      "modifier:positivePower",
      "duration:selfNextEndPhase",
    ]),
  );
});
