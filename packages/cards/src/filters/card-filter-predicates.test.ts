import { describe, expect, it } from "vitest";

import { parseCardFilterPredicates } from "./card-filter-predicates.js";

describe("card filter predicate parser", () => {
  it("parses type, category, power, and different-name predicates independently", () => {
    expect(
      parseCardFilterPredicates({
        text: "{Five Elders} type Character cards with 5000 power and different card names",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        typesAny: ["Five Elders"],
        power: { op: "eq", value: 5000 },
        custom: "differentNames",
      },
      evidence: [
        "filter:type",
        "filter:category:character",
        "filter:power",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
        "filter:differentNames",
      ],
      rest: "",
    });
  });

  it("parses category plus cost threshold without requiring a type predicate", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with a cost of 5 or more",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        cost: { min: 5 },
      },
      evidence: [
        "filter:category:character",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses base cost as a reusable printed/base cost predicate", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with a base cost of 5 or less",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        baseCost: { max: 5 },
      },
      evidence: [
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses power thresholds as printed/base power predicates by default", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with 3000 power or less",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        power: { max: 3000 },
      },
      evidence: [
        "filter:category:character",
        "filter:power",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });

    expect(
      parseCardFilterPredicates({
        text: "Characters with 3000 power or more",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        power: { min: 3000 },
      },
      evidence: [
        "filter:category:character",
        "filter:power",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("can parse field-target power thresholds as current-power predicates", () => {
    expect(
      parseCardFilterPredicates(
        {
          text: "Characters with 3000 power or less",
        },
        { powerSemantics: "current" },
      ),
    ).toEqual({
      filter: {
        categories: ["character"],
        currentPower: { max: 3000 },
      },
      evidence: [
        "filter:category:character",
        "filter:currentPower",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses quoted type-including text and comma-separated current power predicates", () => {
    expect(
      parseCardFilterPredicates(
        {
          text: 'with a type including "Whitebeard Pirates", with 8000 power or more, gains [Rush]',
        },
        { powerSemantics: "current" },
      ),
    ).toEqual({
      filter: {
        typesIncludeAny: ["Whitebeard Pirates"],
        currentPower: { min: 8000 },
      },
      evidence: [
        "filter:type",
        "filter:currentPower",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: ", gains [Rush]",
    });
  });

  it("parses base power thresholds as printed/base power predicates", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with 3000 base power or less",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        power: { max: 3000 },
      },
      evidence: [
        "filter:category:character",
        "filter:power",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses bracketed card names as a reusable name predicate", () => {
    expect(parseCardFilterPredicates({ text: "[Imu]" })).toEqual({
      filter: { names: ["Imu"] },
      evidence: ["filter:name"],
      rest: "",
    });
  });

  it("parses color plus type plus category predicates for searches", () => {
    expect(
      parseCardFilterPredicates({
        text: "green {East Blue} type card other than [Nami]",
      }),
    ).toEqual({
      filter: {
        colorsAny: ["green"],
        typesAny: ["East Blue"],
        nameNot: ["Nami"],
      },
      evidence: ["filter:color", "filter:type", "filter:nameNot"],
      rest: "",
    });
  });

  it("parses type-or-attribute alternatives separately from shared character predicates", () => {
    expect(
      parseCardFilterPredicates({
        text: "{Muggy Kingdom} type or <Slash> attribute Character card with a cost of 4 or less other than [Dracule Mihawk]",
      }),
    ).toEqual({
      filter: {
        anyOf: [{ typesAny: ["Muggy Kingdom"] }, { attributesAny: ["slash"] }],
        categories: ["character"],
        cost: { max: 4 },
        nameNot: ["Dracule Mihawk"],
      },
      evidence: [
        "filter:anyOf",
        "filter:type",
        "filter:attribute",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "filter:nameNot",
      ],
      rest: "",
    });
  });

  it("parses same-category type alternatives as one reusable typesAny filter", () => {
    expect(
      parseCardFilterPredicates({
        text: "{Alabasta} or {Straw Hat Crew} type Character card with a cost of 5 or less",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        typesAny: ["Alabasta", "Straw Hat Crew"],
        cost: { max: 5 },
      },
      evidence: [
        "filter:type",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses self exclusion separately from attribute, category, and cost predicates", () => {
    expect(
      parseCardFilterPredicates({
        text: "<Slash> attribute Character with a cost of 5 or less other than this Character",
      }),
    ).toEqual({
      filter: {
        attributesAny: ["slash"],
        categories: ["character"],
        cost: { max: 5 },
        excludeSelf: true,
      },
      evidence: [
        "filter:attribute",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "filter:excludeSelf",
      ],
      rest: "",
    });
  });

  it("parses attribute-only predicates separately from category predicates", () => {
    expect(
      parseCardFilterPredicates({
        text: "<Slash> attribute",
      }),
    ).toEqual({
      filter: { attributesAny: ["slash"] },
      evidence: ["filter:attribute"],
      rest: "",
    });
  });

  it("parses attribute-card or color-event alternatives as reusable filters", () => {
    expect(
      parseCardFilterPredicates({
        text: "<Slash> attribute card or green Event",
      }),
    ).toEqual({
      filter: {
        anyOf: [
          { attributesAny: ["slash"] },
          { colorsAny: ["green"], categories: ["event"] },
        ],
      },
      evidence: [
        "filter:anyOf",
        "filter:attribute",
        "filter:color",
        "filter:category:event",
      ],
      rest: "",
    });
  });
});
