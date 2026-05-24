import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";

export const donFieldCountConditionPrimitive: PrimitivePatternDefinition<ConditionParseResult> =
  {
    primitiveId: "condition:donFieldCount",
    matches: [
      {
        id: "you-have-n-or-less-don-cards-on-your-field",
        pattern:
          /^you have (?<count>[1-9]\d*) or less DON!! cards on your field$/i,
        build: (groups) => ({
          condition: {
            type: "fieldCount",
            player: "self",
            filter: {
              categories: ["don"],
            },
            op: "lte",
            value: Number.parseInt(groups["count"] ?? "", 10),
          },
          evidence: [
            "condition:donFieldCount",
            "condition:comparator:lte",
            "condition:threshold:positiveInteger",
            "player:self",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseDonFieldCountCondition: ConditionParser = (input) =>
  parsePrimitivePattern(input, donFieldCountConditionPrimitive);
