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

  it("parses base cost as the same reusable cost predicate family", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with a base cost of 5 or less",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        cost: { max: 5 },
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

  it("parses power thresholds as the same reusable power predicate family", () => {
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
});
