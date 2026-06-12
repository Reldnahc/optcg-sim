import { describe, expect, it } from "vitest";

import { parseYourFieldReplacementTarget } from "./replacement-targets.js";

describe("replacement field target parser", () => {
  it("parses field replacement target power predicates as current power unless base is explicit", () => {
    const currentPower = parseYourFieldReplacementTarget({
      text: "your {Sky Island} type Character with 6000 power or more would be removed",
    });
    expect(currentPower).toMatchObject({
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Sky Island"],
          currentPower: { min: 6000 },
        },
      },
      rest: "would be removed",
    });
    expect(currentPower?.evidence).toContain("filter:currentPower");

    const basePower = parseYourFieldReplacementTarget({
      text: "your {Sky Island} type Character with 6000 base power or more would be removed",
    });
    expect(basePower).toMatchObject({
      target: {
        filter: {
          categories: ["character"],
          typesAny: ["Sky Island"],
          power: { min: 6000 },
        },
      },
      rest: "would be removed",
    });
    expect(basePower?.evidence).toContain("filter:power");
  });

  it("parses bare typed Character replacement targets", () => {
    const result = parseYourFieldReplacementTarget({
      text: "your {Supernovas} type Character would be removed",
    });

    expect(result).toMatchObject({
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Supernovas"],
        },
      },
      rest: "would be removed",
    });
    expect(result?.evidence).toContain("filter:type");
    expect(result?.evidence).toContain("filter:category:character");
  });
});
