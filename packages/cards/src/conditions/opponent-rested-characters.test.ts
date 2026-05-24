import { describe, expect, it } from "vitest";

import { parseOpponentRestedCharactersCondition } from "./opponent-rested-characters.js";

describe("opponent rested Characters condition parser", () => {
  it("parses opponent rested Character count thresholds", () => {
    expect(
      parseOpponentRestedCharactersCondition({
        text: "your opponent has 2 or more rested Characters",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "opponent",
        filter: {
          categories: ["character"],
          state: "rested",
        },
        op: "gte",
        value: 2,
      },
      evidence: [
        "condition:opponentFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:opponent",
      ],
      rest: "",
    });
  });

  it("rejects unsupported condition wording", () => {
    expect(
      parseOpponentRestedCharactersCondition({
        text: "your opponent has rested Characters",
      }),
    ).toBeUndefined();
  });
});
