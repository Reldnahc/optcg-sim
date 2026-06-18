import { describe, expect, it } from "vitest";

import { parseForcedReturnDonInstruction } from "./return-don.js";

describe("return DON instruction parser", () => {
  it.each([
    {
      text: "return 1 DON!! card from your field to your DON!! deck",
      player: "self",
    },
    {
      text: "your opponent returns 1 DON!! card from their field to their DON!! deck",
      player: "opponent",
    },
  ] as const)(
    "parses $text as a reusable returnDon body primitive",
    (input) => {
      expect(parseForcedReturnDonInstruction({ text: input.text })).toEqual({
        effect: { type: "returnDon", count: 1, player: input.player },
        evidence: [
          "instruction:returnDon",
          `player:${input.player}`,
          "count:positiveInteger",
        ],
        rest: "",
      });
    },
  );

  it("parses return-DON until your field count matches your opponent", () => {
    expect(
      parseForcedReturnDonInstruction({
        text: "return DON!! cards from your field to your DON!! deck until you have the same number of DON!! cards on your field as your opponent.",
      }),
    ).toEqual({
      effect: {
        type: "returnDon",
        player: "self",
        count: {
          type: "fieldCountDifference",
          minuend: {
            player: "self",
            zone: "costArea",
            filter: { categories: ["don"] },
          },
          subtrahend: {
            player: "opponent",
            zone: "costArea",
            filter: { categories: ["don"] },
          },
          minimum: 0,
        },
      },
      evidence: [
        "instruction:returnDon",
        "player:self",
        "condition:fieldCountDifference",
        "filter:category:don",
        "valueTransform:minimum",
      ],
      rest: "",
    });
  });
});
