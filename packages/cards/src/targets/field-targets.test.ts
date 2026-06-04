import { describe, expect, it } from "vitest";

import {
  opponentCharactersTargetPrimitive,
  opponentLeaderOrCharactersTargetPrimitive,
  parseOpponentCharactersTarget,
  parseOpponentLeaderOrCharacterCardsTarget,
  parseYourCharactersTarget,
  parseYourNamedCardsTarget,
  parseYourLeaderTarget,
  yourCharactersTargetPrimitive,
  yourNamedCardsTargetPrimitive,
  yourLeaderTargetPrimitive,
} from "./field-targets.js";

describe("field target parsers", () => {
  it("defines reusable target primitive parents", () => {
    expect(opponentCharactersTargetPrimitive).toEqual({
      primitiveId: "target:opponentCharacters",
      matches: [{ id: "of-your-opponents-characters" }],
    });
    expect(opponentLeaderOrCharactersTargetPrimitive).toEqual({
      primitiveId: "target:opponentLeaderOrCharacters",
      matches: [{ id: "of-your-opponents-leader-or-character-cards" }],
    });
    expect(yourLeaderTargetPrimitive).toEqual({
      primitiveId: "target:yourLeader",
      matches: [{ id: "your-leader" }],
    });
    expect(yourCharactersTargetPrimitive).toEqual({
      primitiveId: "target:yourCharacters",
      matches: [{ id: "of-your-characters" }],
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

  it("parses opponent Leader or Character cards target", () => {
    expect(
      parseOpponentLeaderOrCharacterCardsTarget({
        text: "of your opponent's Leader or Character cards.",
      }),
    ).toEqual({
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zones: ["leaderArea", "characterArea"],
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: { categories: ["leader", "character"] },
        },
      },
      evidence: [
        "target:opponentLeaderOrCharacters",
        "player:opponent",
        "filter:category:leader",
        "filter:category:character",
      ],
      rest: ".",
    });
  });

  it("parses opponent Leader or Character cards target with reusable cost predicates", () => {
    expect(
      parseOpponentLeaderOrCharacterCardsTarget({
        text: "of your opponent's Leader or Character cards with a cost of 7 or less.",
      }),
    ).toEqual({
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zones: ["leaderArea", "characterArea"],
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: {
            anyOf: [
              { categories: ["leader"] },
              { categories: ["character"], cost: { max: 7 } },
            ],
          },
        },
      },
      evidence: [
        "target:opponentLeaderOrCharacters",
        "player:opponent",
        "filter:category:leader",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: ".",
    });
  });

  it("parses opponent field target power predicates as current power unless base is explicit", () => {
    const currentPower = parseOpponentCharactersTarget({
      text: "of your opponent's Characters with 3000 power or less",
    });
    expect(currentPower).toMatchObject({
      filter: { categories: ["character"], currentPower: { max: 3000 } },
      rest: "",
    });
    expect(currentPower?.evidence).toContain("filter:currentPower");

    const basePower = parseOpponentCharactersTarget({
      text: "of your opponent's Characters with 3000 base power or less",
    });
    expect(basePower).toMatchObject({
      filter: { categories: ["character"], power: { max: 3000 } },
      rest: "",
    });
    expect(basePower?.evidence).toContain("filter:power");
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

  it("parses your Characters target and leaves modifier text", () => {
    expect(
      parseYourCharactersTarget({
        text: "of your Characters gains +2 cost until the end of your opponent's next End Phase.",
      }),
    ).toEqual({
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zone: "characterArea",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: { categories: ["character"] },
        },
      },
      evidence: [
        "target:yourCharacters",
        "player:self",
        "filter:category:character",
      ],
      rest: "gains +2 cost until the end of your opponent's next End Phase.",
    });
  });
});
