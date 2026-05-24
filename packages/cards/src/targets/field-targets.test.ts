import { describe, expect, it } from "vitest";

import {
  opponentCharactersTargetPrimitive,
  parseOpponentCharactersTarget,
  parseYourLeaderTarget,
  yourLeaderTargetPrimitive,
} from "./field-targets.js";

describe("field target parsers", () => {
  it("defines reusable target primitive parents", () => {
    expect(opponentCharactersTargetPrimitive).toEqual({
      primitiveId: "target:opponentCharacters",
      matches: [{ id: "of-your-opponents-characters" }],
    });
    expect(yourLeaderTargetPrimitive).toEqual({
      primitiveId: "target:yourLeader",
      matches: [{ id: "your-leader" }],
    });
  });

  it("parses opponent Characters target", () => {
    expect(
      parseOpponentCharactersTarget({
        text: "of your opponent's Characters −1000 power during this turn.",
      }),
    ).toEqual({
      filter: { categories: ["character"] },
      evidence: [
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
      ],
      rest: "−1000 power during this turn.",
    });
  });

  it("parses your Leader target and leaves modifier text", () => {
    expect(
      parseYourLeaderTarget({
        text: "your Leader gains +2000 power until the end of your opponent's next End Phase.",
      }),
    ).toEqual({
      target: { type: "myLeader" },
      evidence: ["target:yourLeader"],
      rest: "gains +2000 power until the end of your opponent's next End Phase.",
    });
  });
});
