import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP14 all-field stat gain parsing", () => {
  it("decomposes all typed Leader and Character stat gains into zone-specific primitives", () => {
    const result = parseCardEffectLine(
      "[Main] All of your {Fish-Man} or {Merfolk} type Leader and Character cards gain +1000 power during this turn.",
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
                type: "modifyPower",
                target: {
                  type: "all",
                  player: "self",
                  zone: "leaderArea",
                  filter: {
                    categories: ["leader"],
                    typesAny: ["Fish-Man", "Merfolk"],
                  },
                },
                value: 1000,
                duration: { type: "thisTurn" },
              },
            },
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: {
                  type: "all",
                  player: "self",
                  zone: "characterArea",
                  filter: {
                    categories: ["character"],
                    typesAny: ["Fish-Man", "Merfolk"],
                  },
                },
                value: 1000,
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
        "instruction:modifyPower",
        "cardinality:all",
        "zone:leaderArea",
        "zone:characterArea",
        "filter:type",
        "duration:thisTurn",
      ]),
    );
  });
});
