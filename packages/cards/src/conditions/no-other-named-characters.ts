import { parseCardFilterPredicates } from "../filters/index.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";

export const noOtherNamedCharactersConditionPrimitive = {
  primitiveId: "condition:fieldCount",
  childPrimitiveIds: [
    "player:self",
    "zone:characterArea",
    "filter:category:character",
    "filter:name",
    "filter:excludeSelf",
    "condition:comparator:eq",
    "condition:threshold:nonNegativeInteger",
  ],
} as const;

export const parseNoOtherNamedCharactersCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const match = /^you have no other\s+(?<predicate>.+)$/i.exec(input.text);
  const predicateText = match?.groups?.["predicate"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: predicateText });
  if (
    predicates === undefined ||
    predicates.rest.length > 0 ||
    predicates.filter.categories?.includes("character") !== true ||
    predicates.filter.names === undefined ||
    predicates.filter.names.length === 0
  ) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player: "self",
      filter: {
        ...predicates.filter,
        excludeSelf: true,
      },
      op: "eq",
      value: 0,
    },
    evidence: [
      "condition:fieldCount",
      "player:self",
      "zone:characterArea",
      "filter:category:character",
      "filter:name",
      "filter:excludeSelf",
      "condition:comparator:eq",
      "condition:threshold:nonNegativeInteger",
    ],
    rest: "",
  };
};
