import { describe, expect, it } from "vitest";

import { parseAllFieldTarget } from "./all-field-targets.js";

describe("all field target parser", () => {
  it("parses all of your Characters as cardinality plus owner plus object kind", () => {
    expect(parseAllFieldTarget({ text: "all of your Characters" })).toEqual({
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: { categories: ["character"] },
      },
      evidence: [
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("parses all of your typed Characters as an added type filter", () => {
    expect(
      parseAllFieldTarget({
        text: "all of your {Sky Island} type Characters",
      }),
    ).toEqual({
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Sky Island"],
        },
      },
      evidence: [
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:type",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("parses all Characters with a cost predicate without requiring a type", () => {
    expect(
      parseAllFieldTarget({
        text: "all of your Characters with a cost of 5 or more",
      }),
    ).toMatchObject({
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: {
          categories: ["character"],
          cost: { min: 5 },
        },
      },
      evidence: [
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses ownerless all Characters as an any-player field target", () => {
    expect(
      parseAllFieldTarget({
        text: "all Characters with a cost of 1 or less",
      }),
    ).toMatchObject({
      target: {
        type: "all",
        zone: "characterArea",
        player: "anyPlayer",
        filter: {
          categories: ["character"],
          cost: { max: 1 },
        },
      },
      evidence: [
        "cardinality:all",
        "player:any",
        "zone:characterArea",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("preserves rested-state filters on ownerless all Character targets", () => {
    expect(
      parseAllFieldTarget({
        text: "all rested Characters with a cost of 5 or less",
      }),
    ).toMatchObject({
      target: {
        type: "all",
        zone: "characterArea",
        player: "anyPlayer",
        filter: {
          categories: ["character"],
          state: "rested",
          cost: { max: 5 },
        },
      },
      rest: "",
    });
    expect(
      parseAllFieldTarget({
        text: "all rested Characters with a cost of 5 or less",
      })?.evidence,
    ).toEqual(
      expect.arrayContaining([
        "cardinality:all",
        "player:any",
        "zone:characterArea",
        "filter:category:character",
        "filter:state:rested",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ]),
    );
  });
});
