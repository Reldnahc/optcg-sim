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
          /^(?<player>you have|your opponent has) (?<count>\d+) Life cards$/i,
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
