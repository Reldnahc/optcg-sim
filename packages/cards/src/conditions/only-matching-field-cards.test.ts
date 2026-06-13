import { describe, expect, it } from "vitest";

import { parseOnlyMatchingFieldCardsCondition } from "./only-matching-field-cards.js";

describe("only matching field cards condition parser", () => {
  it("parses field Character power predicates as current power unless base is explicit", () => {
    const currentPower = parseOnlyMatchingFieldCardsCondition({
      text: "the only Characters on your field are {Sky Island} type Characters with 6000 power or more",
    });
    expect(currentPower).toMatchObject({
      condition: {
        type: "onlyMatchingFieldCards",
        zone: "characterArea",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Sky Island"],
          currentPower: { min: 6000 },
        },
      },
    });
    expect(currentPower?.evidence).toContain("filter:currentPower");

    const basePower = parseOnlyMatchingFieldCardsCondition({
      text: "the only Characters on your field are {Sky Island} type Characters with 6000 base power or more",
    });
    expect(basePower).toMatchObject({
      condition: {
        filter: {
          categories: ["character"],
          typesAny: ["Sky Island"],
          power: { min: 6000 },
        },
      },
    });
    expect(basePower?.evidence).toContain("filter:power");
  });

  it("parses you-only-have wording as the same field Character condition", () => {
    const result = parseOnlyMatchingFieldCardsCondition({
      text: "you only have {Celestial Dragons} type Characters",
    });

    expect(result).toMatchObject({
      condition: {
        type: "onlyMatchingFieldCards",
        zone: "characterArea",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Celestial Dragons"],
        },
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:onlyMatchingFieldCards",
        "player:self",
        "zone:characterArea",
        "filter:category:character",
        "filter:type",
      ]),
    );
  });
});
