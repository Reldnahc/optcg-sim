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
