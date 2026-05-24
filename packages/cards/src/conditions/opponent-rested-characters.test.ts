import { describe, expect, it } from "vitest";

import {
  opponentRestedCharactersConditionPrimitive,
  parseOpponentRestedCharactersCondition,
} from "./opponent-rested-characters.js";

describe("opponent rested Characters condition parser", () => {
  it("defines the condition as a primitive parent with match families", () => {
    expect(opponentRestedCharactersConditionPrimitive).toMatchObject({
      primitiveId: "condition:opponentFieldCount",
      matches: [
        {
          id: "opponent-has-n-or-more-rested-characters",
        },
      ],
    });
  });

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

  it("keeps wording variants inside the same condition primitive", () => {
    const plural = parseOpponentRestedCharactersCondition({
      text: "your opponent has 2 or more rested Characters",
    });
    const singular = parseOpponentRestedCharactersCondition({
      text: "your opponent has 2 or more rested Character",
    });

    expect(singular).toEqual(plural);
  });

  it("rejects unsupported condition wording", () => {
    expect(
      parseOpponentRestedCharactersCondition({
        text: "your opponent has rested Characters",
      }),
    ).toBeUndefined();
  });
});
