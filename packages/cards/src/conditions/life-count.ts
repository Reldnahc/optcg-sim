import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";

export const lifeCountConditionPrimitive: PrimitivePatternDefinition<ConditionParseResult> =
  {
    primitiveId: "condition:lifeCount",
    matches: [
      {
        id: "player-has-exactly-n-life-cards",
        pattern:
          /^(?<player>you have|your opponent has) (?<count>\d+) Life cards?$/i,
        build: (groups) => {
          const player =
            groups["player"]?.toLowerCase() === "your opponent has"
              ? "opponent"
              : "self";
          const count = Number.parseInt(groups["count"] ?? "", 10);
          return {
            condition: {
              type: "lifeCount",
              player,
              op: "eq",
              value: count,
            },
            evidence: [
              "condition:lifeCount",
              "condition:comparator:eq",
              count === 0
                ? "condition:threshold:nonNegativeInteger"
                : "condition:threshold:positiveInteger",
              player === "opponent" ? "player:opponent" : "player:self",
            ],
            rest: "",
          };
        },
      },
      {
        id: "player-has-n-or-threshold-life-cards",
        pattern:
          /^(?<player>you have|your opponent has) (?<count>[1-9]\d*) or (?<direction>more|less) Life cards$/i,
        build: (groups) => {
          const direction = groups["direction"]?.toLowerCase();
          const op = direction === "more" ? "gte" : "lte";
          const player =
            groups["player"]?.toLowerCase() === "your opponent has"
              ? "opponent"
              : "self";
          return {
            condition: {
              type: "lifeCount",
              player,
              op,
              value: Number.parseInt(groups["count"] ?? "", 10),
            },
            evidence: [
              "condition:lifeCount",
              op === "gte"
                ? "condition:comparator:gte"
                : "condition:comparator:lte",
              "condition:threshold:positiveInteger",
              player === "opponent" ? "player:opponent" : "player:self",
            ],
            rest: "",
          };
        },
      },
    ],
  };

export const parseLifeCountCondition: ConditionParser = (input) =>
  parsePrimitivePattern(input, lifeCountConditionPrimitive);

export const parseLifeCountDifferenceCondition: ConditionParser = (input) => {
  const equalOrLessMatch =
    /^the number of your Life cards is equal to or less than the number of your opponent's Life cards$/iu.exec(
      input.text,
    );
  if (equalOrLessMatch !== null) {
    return {
      condition: {
        type: "lifeCountDifference",
        minuend: { player: "opponent" },
        subtrahend: { player: "self" },
        op: "gte",
        value: 0,
      },
      evidence: [
        "condition:lifeCountDifference",
        "player:opponent",
        "player:self",
        "condition:comparator:gte",
        "condition:threshold:nonNegativeInteger",
      ],
      rest: "",
    };
  }

  return undefined;
};

export const parseLifeCountTotalCondition: ConditionParser = (input) => {
  const match =
    /^you and your opponent have a total of (?<count>[1-9]\d*) or (?<direction>more|less) Life cards$/iu.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const direction = match?.groups?.["direction"]?.toLowerCase();
  if (countText === undefined || direction === undefined) {
    return undefined;
  }
  const op = direction === "more" ? "gte" : "lte";

  return {
    condition: {
      type: "lifeCountTotal",
      players: ["self", "opponent"],
      op,
      value: Number.parseInt(countText, 10),
    },
    evidence: [
      "condition:lifeCountTotal",
      "player:self",
      "player:opponent",
      op === "gte" ? "condition:comparator:gte" : "condition:comparator:lte",
      "condition:threshold:positiveInteger",
    ],
    rest: "",
  };
};

export const parseEitherPlayerLifeCountCondition: ConditionParser = (input) => {
  const match =
    /^either you or your opponent has (?<count>\d+) Life cards$/iu.exec(
      input.text,
    );
  const count = Number.parseInt(match?.groups?.["count"] ?? "", 10);
  if (!Number.isSafeInteger(count) || count < 0) {
    return undefined;
  }

  return {
    condition: {
      type: "or",
      conditions: [
        { type: "lifeCount", player: "self", op: "eq", value: count },
        { type: "lifeCount", player: "opponent", op: "eq", value: count },
      ],
    },
    evidence: [
      "composition:conditionOr",
      "condition:lifeCount",
      "condition:lifeCount",
      "condition:comparator:eq",
      count === 0
        ? "condition:threshold:nonNegativeInteger"
        : "condition:threshold:positiveInteger",
      "player:self",
      "player:opponent",
    ],
    rest: "",
  };
};
