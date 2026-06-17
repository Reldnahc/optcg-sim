import { describe, expect, it } from "vitest";

import { parseFieldCardCountCondition } from "./field-card-count.js";

describe("field card count condition parser", () => {
  it("parses self matching Character presence through reusable filters", () => {
    expect(
      parseFieldCardCountCondition({
        text: "you have an {Admiral} type Character",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Admiral"],
        },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:fieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:type",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("parses opponent matching Character presence through reusable filters", () => {
    expect(
      parseFieldCardCountCondition({
        text: "your opponent has a Character with 8000 power or more",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "opponent",
        filter: {
          categories: ["character"],
          currentPower: { min: 8000 },
        },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:opponentFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:opponent",
        "filter:category:character",
        "filter:currentPower",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("shares trailing Character category over named field-count alternatives", () => {
    expect(
      parseFieldCardCountCondition({
        text: "you have a [Buggy] or [Mohji] Character",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          categories: ["character"],
          anyOf: [{ names: ["Buggy"] }, { names: ["Mohji"] }],
        },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:fieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:anyOf",
        "filter:name",
        "filter:name",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("parses opponent compared field counts through reusable filters", () => {
    expect(
      parseFieldCardCountCondition({
        text: "your opponent has 2 or more Characters with a base power of 5000 or more",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "opponent",
        filter: {
          categories: ["character"],
          power: { min: 5000 },
        },
        op: "gte",
        value: 2,
      },
      evidence: [
        "condition:opponentFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:opponent",
        "filter:category:character",
        "filter:power",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses total field counts across both players through reusable filters", () => {
    expect(
      parseFieldCardCountCondition({
        text: "there are 2 or more Characters with a cost of 8 or more",
      }),
    ).toEqual({
      condition: {
        type: "fieldCountTotal",
        players: ["self", "opponent"],
        filter: {
          categories: ["character"],
          cost: { min: 8 },
        },
        op: "gte",
        value: 2,
      },
      evidence: [
        "condition:fieldCountTotal",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        "player:opponent",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses no matching Characters as a reusable zero field-count condition", () => {
    expect(
      parseFieldCardCountCondition({
        text: 'you have no Characters with a type including "Whitebeard Pirates" and a cost of 8 or more',
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          categories: ["character"],
          typesIncludeAny: ["Whitebeard Pirates"],
          cost: { min: 8 },
        },
        op: "eq",
        value: 0,
      },
      evidence: [
        "condition:fieldCount",
        "condition:comparator:eq",
        "condition:threshold:nonNegativeInteger",
        "player:self",
        "filter:category:character",
        "filter:type",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses named absence as a reusable zero field-count condition", () => {
    expect(
      parseFieldCardCountCondition({
        text: "you don't have [Rock]",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          names: ["Rock"],
        },
        op: "eq",
        value: 0,
      },
      evidence: [
        "condition:fieldCount",
        "condition:comparator:eq",
        "condition:threshold:nonNegativeInteger",
        "player:self",
        "filter:name",
      ],
      rest: "",
    });
  });

  it("parses exact matching Characters with different card names as field-count filter data", () => {
    expect(
      parseFieldCardCountCondition({
        text: "you have 5 {Impel Down} type Characters with different card names",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Impel Down"],
          custom: "differentNames",
        },
        op: "eq",
        value: 5,
      },
      evidence: [
        "condition:fieldCount",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:type",
        "filter:category:character",
        "filter:differentNames",
      ],
      rest: "",
    });
  });

  it("parses not having an exact matching Character count as less-than field-count data", () => {
    expect(
      parseFieldCardCountCondition({
        text: "you do not have 5 Characters with a cost of 5 or more",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          categories: ["character"],
          cost: { min: 5 },
        },
        op: "lt",
        value: 5,
      },
      evidence: [
        "condition:fieldCount",
        "condition:comparator:lt",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses typed Character presence excluding this card as reusable filter data", () => {
    expect(
      parseFieldCardCountCondition({
        text: "you have a {Mountain Bandits} type Character other than this card",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Mountain Bandits"],
          excludeSelf: true,
        },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:fieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:type",
        "filter:category:character",
        "filter:excludeSelf",
      ],
      rest: "",
    });
  });

  it("parses Character count differences as reusable field-count operands", () => {
    expect(
      parseFieldCardCountCondition({
        text: "the number of your Characters is at least 2 less than the number of your opponent's Characters",
      }),
    ).toEqual({
      condition: {
        type: "fieldCountDifference",
        minuend: {
          player: "opponent",
          filter: { categories: ["character"] },
        },
        subtrahend: {
          player: "self",
          filter: { categories: ["character"] },
        },
        op: "gte",
        value: 2,
      },
      evidence: [
        "condition:fieldCountDifference",
        "player:opponent",
        "player:self",
        "filter:category:character",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "valueOffset:fieldCountDifference",
      ],
      rest: "",
    });
  });

  it("parses total Character cost as reusable field-stat-total data", () => {
    expect(
      parseFieldCardCountCondition({
        text: "the total cost of your Characters is 5 or more",
      }),
    ).toEqual({
      condition: {
        type: "fieldStatTotal",
        player: "self",
        filter: {
          categories: ["character"],
        },
        stat: "cost",
        op: "gte",
        value: 5,
      },
      evidence: [
        "condition:fieldStatTotal",
        "condition:stat:cost",
        "player:self",
        "filter:category:character",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });
});
