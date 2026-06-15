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
      {
        id: "you-have-named-cards-in-your-trash",
        pattern:
          /^you have (?<names>\[[^\]]+\](?:\s*(?:,|and)\s*\[[^\]]+\])*) in your trash$/i,
        build: (groups) => {
          const names = parseBracketedNames(groups["names"] ?? "");
          return {
            condition: {
              type: "and",
              conditions: names.map((name) => ({
                type: "trashCount" as const,
                player: "self" as const,
                filter: { names: [name] },
                op: "gte" as const,
                value: 1,
              })),
            },
            evidence: [
              "condition:trashCount",
              "condition:comparator:gte",
              "condition:threshold:positiveInteger",
              "player:self",
              ...names.map(() => "filter:name" as const),
              "composition:conditionAnd",
            ],
            rest: "",
          };
        },
      },
    ],
  };

export const parseTrashCountCondition: ConditionParser = (input) =>
  parsePrimitivePattern(input, trashCountConditionPrimitive);

function parseBracketedNames(text: string): string[] {
  return [...text.matchAll(/\[([^\]]+)\]/gu)]
    .map((match) => match[1]?.trim())
    .filter((name): name is string => name !== undefined && name.length > 0);
}
