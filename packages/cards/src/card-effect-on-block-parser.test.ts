import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("On Block card effect parser", () => {
  it("parses On Block through the supported entry wrapper and reusable body parser", () => {
    const result = parseCardEffectLine(
      "[On Block] Rest up to 1 of your opponent's Characters with a cost of 5 or less.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onBlock" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectTargets",
                request: {
                  player: "opponent",
                  zone: "characterArea",
                  filter: { categories: ["character"], cost: { max: 5 } },
                },
              },
            },
            { effect: { type: "rest" } },
          ],
        },
      },
    });
    expect(result?.evidence).toContain("entry:onBlock");
    expect(result?.evidence).toContain("sourcePresence:mustRemain");
    expect(result?.evidence).not.toContain("entrySupport:unsupported");
    expect(result?.evidence).toContain("instruction:rest");
  });
});
