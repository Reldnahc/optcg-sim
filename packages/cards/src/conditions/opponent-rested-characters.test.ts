import { describe, expect, it } from "vitest";

import {
  opponentRestedCharactersConditionPrimitive,
  parseOpponentRestedCharactersCondition,
} from "./opponent-rested-characters.js";

describe("opponent rested Characters condition parser", () => {
  it("defines the condition as a primitive parent with match families", () => {
    expect(opponentRestedCharactersConditionPrimitive).toMatchObject({
      primitiveId: "condition:opponentFieldCount",
      childPrimitiveIds: [
        "player:opponent",
        "condition:comparator:gte",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
        "filter:state:rested",
        "filter:category:character",
      ],
    });
  });

  it("parses exact opponent rested Character count thresholds", () => {
    expect(
      parseOpponentRestedCharactersCondition({
        text: "your opponent has 2 rested Characters",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "opponent",
        filter: {
          categories: ["character"],
          state: "rested",
        },
        op: "eq",
        value: 2,
      },
      evidence: [
        "condition:opponentFieldCount",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
        "player:opponent",
        "filter:state:rested",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("parses opponent rested Character count thresholds", () => {
    expect(
      parseOpponentRestedCharactersCondition({
        text: "your opponent has 2 or more rested Characters",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "opponent",
        filter: {
          categories: ["character"],
          state: "rested",
        },
        op: "gte",
        value: 2,
      },
      evidence: [
        "condition:opponentFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:opponent",
        "filter:state:rested",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("keeps wording variants inside the same condition primitive", () => {
    const plural = parseOpponentRestedCharactersCondition({
      text: "your opponent has 2 or more rested Characters",
    });
    const singular = parseOpponentRestedCharactersCondition({
      text: "your opponent has 2 or more rested Character",
    });

    expect(singular).toEqual(plural);
  });

  it("parses field Character power predicates as current power unless base is explicit", () => {
    const currentPower = parseOpponentRestedCharactersCondition({
      text: "your opponent has 2 or more rested Characters with 3000 power or less",
    });
    expect(currentPower).toMatchObject({
      condition: {
        filter: {
          categories: ["character"],
          state: "rested",
          currentPower: { max: 3000 },
        },
      },
    });
    expect(currentPower?.evidence).toContain("filter:currentPower");

    const basePower = parseOpponentRestedCharactersCondition({
      text: "your opponent has 2 or more rested Characters with 3000 base power or less",
    });
    expect(basePower).toMatchObject({
      condition: {
        filter: {
          categories: ["character"],
          state: "rested",
          power: { max: 3000 },
        },
      },
    });
    expect(basePower?.evidence).toContain("filter:power");
  });

  it("rejects unsupported condition wording", () => {
    expect(
      parseOpponentRestedCharactersCondition({
        text: "your opponent has rested Characters",
      }),
    ).toBeUndefined();
  });
});
