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
        id: "you-have-n-or-threshold-life-cards",
        pattern:
          /^you have (?<count>[1-9]\d*) or (?<direction>more|less) Life cards$/i,
        build: (groups) => {
          const direction = groups["direction"]?.toLowerCase();
          const op = direction === "more" ? "gte" : "lte";
          return {
            condition: {
              type: "lifeCount",
              player: "self",
              op,
              value: Number.parseInt(groups["count"] ?? "", 10),
            },
            evidence: [
              "condition:lifeCount",
              op === "gte"
                ? "condition:comparator:gte"
                : "condition:comparator:lte",
              "condition:threshold:positiveInteger",
              "player:self",
            ],
            rest: "",
          };
        },
      },
    ],
  };

export const parseLifeCountCondition: ConditionParser = (input) =>
  parsePrimitivePattern(input, lifeCountConditionPrimitive);
