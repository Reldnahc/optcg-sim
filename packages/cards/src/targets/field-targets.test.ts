import { describe, expect, it } from "vitest";

import {
  opponentCharactersTargetPrimitive,
  parseOpponentCharactersTarget,
  parseYourNamedCardsTarget,
  parseYourLeaderTarget,
  yourNamedCardsTargetPrimitive,
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
    expect(yourNamedCardsTargetPrimitive).toEqual({
      primitiveId: "target:yourNamedCards",
      matches: [{ id: "of-your-bracketed-name-cards" }],
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

  it("parses your named field cards target and leaves modifier text", () => {
    expect(
      parseYourNamedCardsTarget({
        text: "of your [Enel] cards gains +2000 power during this battle.",
      }),
    ).toEqual({
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
          filter: { names: ["Enel"] },
        },
      },
      evidence: ["target:yourNamedCards", "player:self", "filter:name"],
      rest: "gains +2000 power during this battle.",
    });
  });
});
