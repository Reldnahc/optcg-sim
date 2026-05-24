import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";

export const opponentRestedCharactersConditionPrimitive: PrimitivePatternDefinition<ConditionParseResult> =
  {
    primitiveId: "condition:opponentFieldCount",
    matches: [
      {
        id: "opponent-has-n-or-more-rested-characters",
        pattern:
          /^your opponent has (?<count>[1-9]\d*) or more rested Characters?$/i,
        build: (groups) => ({
          condition: {
            type: "fieldCount",
            player: "opponent",
            filter: {
              categories: ["character"],
              state: "rested",
            },
            op: "gte",
            value: Number.parseInt(groups["count"] ?? "", 10),
          },
          evidence: [
            "condition:opponentFieldCount",
            "condition:comparator:gte",
            "condition:threshold:positiveInteger",
            "player:opponent",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseOpponentRestedCharactersCondition: ConditionParser = (
  input,
) => parsePrimitivePattern(input, opponentRestedCharactersConditionPrimitive);
