import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";

export const trashCountConditionPrimitive: PrimitivePatternDefinition<ConditionParseResult> =
  {
    primitiveId: "condition:trashCount",
    matches: [
      {
        id: "you-have-n-or-more-cards-in-your-trash",
        pattern: /^you have (?<count>[1-9]\d*) or more cards in your trash$/i,
        build: (groups) => ({
          condition: {
            type: "trashCount",
            player: "self",
            op: "gte",
            value: Number.parseInt(groups["count"] ?? "", 10),
          },
          evidence: [
            "condition:trashCount",
            "condition:comparator:gte",
            "condition:threshold:positiveInteger",
            "player:self",
          ],
          rest: "",
        }),
      },
      {
        id: "you-have-n-or-more-events-in-your-trash",
        pattern: /^you have (?<count>[1-9]\d*) or more Events in your trash$/i,
        build: (groups) => ({
          condition: {
            type: "trashCount",
            player: "self",
            filter: { categories: ["event"] },
            op: "gte",
            value: Number.parseInt(groups["count"] ?? "", 10),
          },
          evidence: [
            "condition:trashCount",
            "condition:comparator:gte",
            "condition:threshold:positiveInteger",
            "player:self",
            "filter:category:event",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseTrashCountCondition: ConditionParser = (input) =>
  parsePrimitivePattern(input, trashCountConditionPrimitive);
