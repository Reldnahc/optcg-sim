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
});
