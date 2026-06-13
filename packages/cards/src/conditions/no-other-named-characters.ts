import { parseCardFilterPredicates } from "../filters/index.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";
import type { CardFilter } from "@optcg/types";

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
  const match = /^(?:you have|there are) no other\s+(?<predicate>.+)$/i.exec(
    input.text,
  );
  const predicateText = match?.groups?.["predicate"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: predicateText });
  const normalizedNamedFilter =
    predicates === undefined
      ? undefined
      : normalizeNamedNoOtherFilter(predicates.filter);
  const namedCards =
    predicates !== undefined &&
    normalizedNamedFilter !== undefined &&
    predicates.rest.length === 0 &&
    normalizedNamedFilter.filter.names !== undefined &&
    normalizedNamedFilter.filter.names.length > 0 &&
    predicates.filter.categories === undefined;
  if (namedCards) {
    return {
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          ...normalizedNamedFilter.filter,
          excludeSelf: true,
        },
        op: "eq",
        value: 0,
      },
      evidence: [
        "condition:fieldCount",
        "player:self",
        ...normalizedNamedFilter.evidence,
        "filter:name",
        ...predicates.evidence.filter((evidence) => evidence !== "filter:name"),
        "filter:excludeSelf",
        "condition:comparator:eq",
        "condition:threshold:nonNegativeInteger",
      ],
      rest: "",
    };
  }

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

const characterOnlyFilterKeys = new Set<keyof CardFilter>([
  "attachedDon",
  "baseCost",
  "cost",
  "currentPower",
  "power",
  "state",
]);

const normalizeNamedNoOtherFilter = (
  filter: CardFilter,
):
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly [
        "zone:characterArea",
        "filter:category:character",
      ];
    }
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly [];
    } => {
  const needsCharacterCategory = Object.keys(filter).some((key) =>
    characterOnlyFilterKeys.has(key as keyof CardFilter),
  );
  if (!needsCharacterCategory) {
    return { filter, evidence: [] };
  }
  return {
    filter: { categories: ["character"], ...filter },
    evidence: ["zone:characterArea", "filter:category:character"],
  };
};
