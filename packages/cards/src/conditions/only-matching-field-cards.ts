import { parseCardFilterPredicates } from "../filters/index.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";

export const onlyMatchingFieldCardsConditionPrimitive = {
  primitiveId: "condition:onlyMatchingFieldCards",
  childPrimitiveIds: ["zone:characterArea", "filter:category:character"],
} as const;

export const parseOnlyMatchingFieldCardsCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const match =
    /^the only Characters on your field are\s+(?<predicate>.+)$/i.exec(
      input.text,
    );
  const predicateText = match?.groups?.["predicate"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: predicateText },
    { powerSemantics: "current" },
  );
  if (
    predicates === undefined ||
    predicates.rest.length > 0 ||
    predicates.filter.categories?.includes("character") !== true
  ) {
    return undefined;
  }

  return {
    condition: {
      type: "onlyMatchingFieldCards",
      zone: "characterArea",
      player: "self",
      filter: predicates.filter,
    },
    evidence: [
      "condition:onlyMatchingFieldCards",
      "player:self",
      "zone:characterArea",
      ...predicates.evidence,
    ],
    rest: "",
  };
};
