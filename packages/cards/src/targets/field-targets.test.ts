import { describe, expect, it } from "vitest";

import {
  opponentCardsTargetPrimitive,
  opponentCharactersTargetPrimitive,
  opponentLeaderOrCharactersTargetPrimitive,
  parseOpponentCardsTarget,
  parseOpponentCharactersTarget,
  parseOpponentLeaderOrCharacterCardsTarget,
  parseCompoundYourCharactersTarget,
  parseYourCharactersTarget,
  parseYourLeaderOrCharacterCardsTarget,
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
    expect(opponentCardsTargetPrimitive).toEqual({
      primitiveId: "target:opponentCards",
      matches: [{ id: "of-your-opponents-cards" }],
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

  it("parses opponent public field cards target", () => {
    expect(
      parseOpponentCardsTarget({
        text: "of your opponent's cards.",
      }),
    ).toEqual({
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: { categories: ["leader", "character", "stage", "don"] },
        },
      },
      evidence: [
        "target:opponentCards",
        "player:opponent",
        "zone:leaderArea",
        "zone:characterArea",
        "zone:stageArea",
        "zone:costArea",
        "filter:category:leader",
        "filter:category:character",
        "filter:category:stage",
        "filter:category:don",
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

  it("parses typed own Leader or Character cards target", () => {
    expect(
      parseYourLeaderOrCharacterCardsTarget({
        text: "of your {Donquixote Pirates} type Leader or Character cards gains +2000 power during this battle.",
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
          filter: {
            categories: ["leader", "character"],
            typesAny: ["Donquixote Pirates"],
          },
        },
      },
      evidence: [
        "target:yourLeaderOrCharacters",
        "player:self",
        "filter:type",
        "filter:category:leader",
        "filter:category:character",
      ],
      rest: "gains +2000 power during this battle.",
    });
  });

  it("parses typed own Leader or Character cards target with reusable cost predicates", () => {
    expect(
      parseYourLeaderOrCharacterCardsTarget({
        text: "of your {East Blue} type Leader or Character cards with a cost of 6 or less.",
      }),
    ).toMatchObject({
      target: {
        type: "chooseFromZones",
        request: {
          player: "self",
          zones: ["leaderArea", "characterArea"],
          filter: {
            categories: ["leader", "character"],
            typesAny: ["East Blue"],
            cost: { max: 6 },
          },
        },
      },
      evidence: [
        "target:yourLeaderOrCharacters",
        "player:self",
        "filter:type",
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

  it("parses typed own Leader target and leaves modifier text", () => {
    expect(
      parseYourLeaderTarget({
        text: "your {Supernovas} type Leader gains +1000 power until the end of your opponent's next turn.",
      }),
    ).toEqual({
      target: {
        type: "all",
        zone: "leaderArea",
        player: "self",
        filter: { categories: ["leader"], typesAny: ["Supernovas"] },
      },
      evidence: ["target:yourLeader", "filter:type", "filter:category:leader"],
      rest: "gains +1000 power until the end of your opponent's next turn.",
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

  it("parses repeated up-to own-character branches as a reusable anyOf target", () => {
    expect(
      parseCompoundYourCharactersTarget(
        {
          text: 'of your [Monkey.D.Luffy] Characters or up to 1 of your Characters with a type including "Whitebeard Pirates", with 8000 power or more, gains [Rush]',
        },
        { mode: "upTo", min: 0, max: 1 },
      ),
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
          filter: {
            categories: ["character"],
            anyOf: [
              { names: ["Monkey.D.Luffy"] },
              {
                typesIncludeAny: ["Whitebeard Pirates"],
                currentPower: { min: 8000 },
              },
            ],
          },
        },
      },
      evidence: [
        "target:yourCharacters",
        "player:self",
        "filter:category:character",
        "filter:name",
        "filter:anyOf",
        "cardinality:upTo",
        "count:positiveInteger",
        "target:yourCharacters",
        "player:self",
        "filter:category:character",
        "filter:type",
        "filter:currentPower",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "gains [Rush]",
    });
  });
});
