import type { CardFilter } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import { parseLeadingCountComparison } from "./comparison.js";
import type {
  ConditionParseResult,
  ConditionParser,
  PrimitiveEvidence,
} from "../types.js";

const parseFieldPredicates = (text: string) => {
  const parsed = parseCardFilterPredicates(
    { text: normalizeFieldPredicateText(text) },
    { powerSemantics: "current" },
  );
  if (parsed === undefined) {
    return undefined;
  }
  const normalizedFilter = normalizeSharedCharacterAlternatives(parsed.filter);
  if (normalizedFilter !== parsed.filter) {
    return {
      ...parsed,
      filter: normalizedFilter,
    };
  }
  if (
    parsed.filter.categories !== undefined ||
    parsed.filter.currentPower === undefined
  ) {
    return parsed;
  }
  return {
    ...parsed,
    filter: {
      ...parsed.filter,
      categories: ["character" as const],
    },
    evidence: [...parsed.evidence, "filter:category:character"] as const,
  };
};

const normalizeFieldPredicateText = (text: string): string =>
  text.replace(/\s+on your field\.?$/iu, "").trim();

const normalizeSharedCharacterAlternatives = (
  filter: CardFilter,
): CardFilter => {
  if (
    filter.categories !== undefined ||
    filter.anyOf === undefined ||
    !filter.anyOf.some(hasOnlyCharacterCategory)
  ) {
    return filter;
  }
  if (
    !filter.anyOf.every(
      (branch) =>
        branch.categories === undefined || hasOnlyCharacterCategory(branch),
    )
  ) {
    return filter;
  }
  return {
    ...filter,
    anyOf: filter.anyOf.map(withoutCategories),
    categories: ["character"],
  };
};

const hasOnlyCharacterCategory = (filter: CardFilter): boolean =>
  filter.categories?.length === 1 && filter.categories[0] === "character";

const withoutCategories = (filter: CardFilter): CardFilter => {
  const next = { ...filter };
  delete next.categories;
  return next;
};

const fieldCountEvidence = (
  player: "self" | "opponent",
  comparison: readonly PrimitiveEvidence[],
  filterEvidence: readonly PrimitiveEvidence[],
): readonly PrimitiveEvidence[] => [
  player === "opponent"
    ? "condition:opponentFieldCount"
    : "condition:fieldCount",
  ...comparison,
  player === "opponent" ? "player:opponent" : "player:self",
  ...filterEvidence,
];

const fieldCountTotalEvidence = (
  comparison: readonly PrimitiveEvidence[],
  filterEvidence: readonly PrimitiveEvidence[],
): readonly PrimitiveEvidence[] => [
  "condition:fieldCountTotal",
  ...comparison,
  "player:self",
  "player:opponent",
  ...filterEvidence,
];

const characterCountDifferenceCondition = (
  value: number,
): ConditionParseResult => ({
  condition: {
    type: "fieldCountDifference",
    minuend: {
      player: "opponent",
      filter: { categories: ["character"] },
    },
    subtrahend: {
      player: "self",
      filter: { categories: ["character"] },
    },
    op: "gte",
    value,
  },
  evidence: [
    "condition:fieldCountDifference",
    "player:opponent",
    "player:self",
    "filter:category:character",
    "condition:comparator:gte",
    "condition:threshold:positiveInteger",
    "valueOffset:fieldCountDifference",
  ],
  rest: "",
});

const parseComparedFieldPresence = (
  text: string,
  player: "self" | "opponent",
): ConditionParseResult | undefined => {
  const comparison = parseLeadingCountComparison({ text });
  if (comparison === undefined) {
    return undefined;
  }

  const predicates = parseFieldPredicates(comparison.rest);
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player,
      filter: predicates.filter,
      op: comparison.op,
      value: comparison.value,
    },
    evidence: fieldCountEvidence(
      player,
      comparison.evidence,
      predicates.evidence,
    ),
    rest: "",
  };
};

function parseLeaderOrCharacterPresence(
  input: string,
  player: "self" | "opponent",
): ConditionParseResult | undefined {
  const ownerText = player === "opponent" ? "your opponent has" : "you have";
  const match = new RegExp(
    `^${ownerText} an? Leader or Character\\b(?<rest>.*)$`,
    "iu",
  ).exec(input);
  const rest = match?.groups?.["rest"]?.trim() ?? "";
  if (match === null) {
    return undefined;
  }
  const predicates = parseFieldPredicates(`Character ${rest}`);
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }
  const filter = withLeaderOrCharacterCategories(predicates.filter);
  return {
    condition: {
      type: "fieldCount",
      player,
      filter,
      op: "gte",
      value: 1,
    },
    evidence: fieldCountEvidence(
      player,
      ["condition:comparator:gte", "condition:threshold:positiveInteger"],
      [
        "filter:category:leader",
        "filter:category:character",
        ...predicates.evidence.filter(
          (evidence) => evidence !== "filter:category:character",
        ),
      ],
    ),
    rest: "",
  };
}

function withLeaderOrCharacterCategories(filter: CardFilter): CardFilter {
  const next = { ...filter };
  delete next.categories;
  return {
    categories: ["leader", "character"],
    ...next,
  };
}

export const parseFieldCardCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const totalComparedPresence = /^there are\s+(?<comparison>.+)$/i.exec(
    input.text,
  );
  const totalComparisonText = totalComparedPresence?.groups?.["comparison"];
  if (totalComparisonText !== undefined) {
    const comparison = parseLeadingCountComparison({
      text: totalComparisonText,
    });
    if (comparison !== undefined) {
      const predicates = parseFieldPredicates(comparison.rest);
      if (predicates !== undefined && predicates.rest.trim().length === 0) {
        return {
          condition: {
            type: "fieldCountTotal",
            players: ["self", "opponent"],
            filter: predicates.filter,
            op: comparison.op,
            value: comparison.value,
          },
          evidence: fieldCountTotalEvidence(
            comparison.evidence,
            predicates.evidence,
          ),
          rest: "",
        };
      }
    }
  }

  const totalCharacterCost =
    /^the total cost of your Characters is (?<comparison>[1-9]\d*(?: or more| or less)?)$/i.exec(
      input.text,
    );
  const totalCharacterCostComparison =
    totalCharacterCost?.groups?.["comparison"];
  if (totalCharacterCostComparison !== undefined) {
    const comparison = parseLeadingCountComparison({
      text: totalCharacterCostComparison,
    });
    if (comparison === undefined || comparison.rest.length > 0) {
      return undefined;
    }

    return {
      condition: {
        type: "fieldStatTotal",
        player: "self",
        filter: { categories: ["character"] },
        stat: "cost",
        op: comparison.op,
        value: comparison.value,
      },
      evidence: [
        "condition:fieldStatTotal",
        "condition:stat:cost",
        "player:self",
        "filter:category:character",
        ...comparison.evidence,
      ],
      rest: "",
    };
  }

  const relativeCharacterCountMatch =
    /^the number of your Characters is at least (?<value>[1-9]\d*) less than the number of your opponent's Characters$/i.exec(
      input.text,
    );
  const relativeCharacterCountText =
    relativeCharacterCountMatch?.groups?.["value"];
  if (relativeCharacterCountText !== undefined) {
    return characterCountDifferenceCondition(
      Number.parseInt(relativeCharacterCountText, 10),
    );
  }

  if (/^you have less Characters than your opponent$/i.test(input.text)) {
    return characterCountDifferenceCondition(1);
  }

  const opponentLeaderOrCharacterPresence = parseLeaderOrCharacterPresence(
    input.text,
    "opponent",
  );
  if (opponentLeaderOrCharacterPresence !== undefined) {
    return opponentLeaderOrCharacterPresence;
  }

  const opponentPresence =
    /^your opponent has an?\s+(?<predicate>Character(?: card)?s?\b.*)$/i.exec(
      input.text,
    );
  const opponentPredicate = opponentPresence?.groups?.["predicate"];
  if (opponentPredicate !== undefined) {
    const predicates = parseFieldPredicates(opponentPredicate);
    if (predicates === undefined || predicates.rest.trim().length > 0) {
      return undefined;
    }

    return {
      condition: {
        type: "fieldCount",
        player: "opponent",
        filter: predicates.filter,
        op: "gte",
        value: 1,
      },
      evidence: fieldCountEvidence(
        "opponent",
        ["condition:comparator:gte", "condition:threshold:positiveInteger"],
        predicates.evidence,
      ),
      rest: "",
    };
  }

  const comparedOpponentPresence =
    /^your opponent has\s+(?<comparison>.+)$/i.exec(input.text);
  const opponentComparisonText =
    comparedOpponentPresence?.groups?.["comparison"];
  if (opponentComparisonText !== undefined) {
    const parsed = parseComparedFieldPresence(
      opponentComparisonText,
      "opponent",
    );
    if (parsed !== undefined) {
      return parsed;
    }
  }

  const selfPresence = /^you have an?\s+(?<predicate>.+)$/i.exec(input.text);
  const selfPresencePredicate = selfPresence?.groups?.["predicate"];
  const selfLeaderOrCharacterPresence = parseLeaderOrCharacterPresence(
    input.text,
    "self",
  );
  if (selfLeaderOrCharacterPresence !== undefined) {
    return selfLeaderOrCharacterPresence;
  }
  if (selfPresencePredicate !== undefined) {
    const predicates = parseFieldPredicates(selfPresencePredicate);
    if (predicates === undefined || predicates.rest.trim().length > 0) {
      return undefined;
    }

    return {
      condition: {
        type: "fieldCount",
        player: "self",
        filter: predicates.filter,
        op: "gte",
        value: 1,
      },
      evidence: fieldCountEvidence(
        "self",
        ["condition:comparator:gte", "condition:threshold:positiveInteger"],
        predicates.evidence,
      ),
      rest: "",
    };
  }

  const selfNamedPresence = /^you have\s+(?<predicate>\[[^\]]+\].*)$/i.exec(
    input.text,
  );
  const selfNamedPredicate = selfNamedPresence?.groups?.["predicate"];
  if (selfNamedPredicate !== undefined) {
    const predicates = parseFieldPredicates(selfNamedPredicate);
    if (predicates === undefined || predicates.rest.trim().length > 0) {
      return undefined;
    }

    return {
      condition: {
        type: "fieldCount",
        player: "self",
        filter: predicates.filter,
        op: "gte",
        value: 1,
      },
      evidence: fieldCountEvidence(
        "self",
        ["condition:comparator:gte", "condition:threshold:positiveInteger"],
        predicates.evidence,
      ),
      rest: "",
    };
  }

  const bareNamedPresence = /^(?<predicate>\[[^\]]+\].*)$/i.exec(input.text);
  const bareNamedPredicate = bareNamedPresence?.groups?.["predicate"];
  if (bareNamedPredicate !== undefined) {
    const predicates = parseFieldPredicates(bareNamedPredicate);
    if (predicates === undefined || predicates.rest.trim().length > 0) {
      return undefined;
    }

    return {
      condition: {
        type: "fieldCount",
        player: "self",
        filter: predicates.filter,
        op: "gte",
        value: 1,
      },
      evidence: fieldCountEvidence(
        "self",
        ["condition:comparator:gte", "condition:threshold:positiveInteger"],
        predicates.evidence,
      ),
      rest: "",
    };
  }

  const comparedSelfPresence = /^you have\s+(?<comparison>.+)$/i.exec(
    input.text,
  );
  const comparisonText = comparedSelfPresence?.groups?.["comparison"];
  if (comparisonText !== undefined) {
    const parsed = parseComparedFieldPresence(comparisonText, "self");
    if (parsed !== undefined) {
      return parsed;
    }
  }

  const exactSelfPresence =
    /^you have (?<count>[1-9]\d*)\s+(?<predicate>.+)$/i.exec(input.text);
  const exactSelfCountText = exactSelfPresence?.groups?.["count"];
  const exactSelfPredicate = exactSelfPresence?.groups?.["predicate"];
  if (exactSelfCountText !== undefined && exactSelfPredicate !== undefined) {
    const predicates = parseFieldPredicates(exactSelfPredicate);
    if (predicates === undefined || predicates.rest.trim().length > 0) {
      return undefined;
    }

    return {
      condition: {
        type: "fieldCount",
        player: "self",
        filter: predicates.filter,
        op: "eq",
        value: Number.parseInt(exactSelfCountText, 10),
      },
      evidence: fieldCountEvidence(
        "self",
        ["condition:comparator:eq", "condition:threshold:positiveInteger"],
        predicates.evidence,
      ),
      rest: "",
    };
  }

  const notExactSelfPresence =
    /^you (?:don't|do not) have (?<count>[1-9]\d*)\s+(?<predicate>.+)$/i.exec(
      input.text,
    );
  const notExactSelfCountText = notExactSelfPresence?.groups?.["count"];
  const notExactSelfPredicate = notExactSelfPresence?.groups?.["predicate"];
  if (
    notExactSelfCountText !== undefined &&
    notExactSelfPredicate !== undefined
  ) {
    const predicates = parseFieldPredicates(notExactSelfPredicate);
    if (predicates === undefined || predicates.rest.trim().length > 0) {
      return undefined;
    }

    return {
      condition: {
        type: "fieldCount",
        player: "self",
        filter: predicates.filter,
        op: "lt",
        value: Number.parseInt(notExactSelfCountText, 10),
      },
      evidence: fieldCountEvidence(
        "self",
        ["condition:comparator:lt", "condition:threshold:positiveInteger"],
        predicates.evidence,
      ),
      rest: "",
    };
  }

  const selfAbsence = /^you (?:don't|do not) have\s+(?<predicate>.+)$/i.exec(
    input.text,
  );
  const selfAbsencePredicate = selfAbsence?.groups?.["predicate"];
  if (selfAbsencePredicate !== undefined) {
    const predicates = parseFieldPredicates(selfAbsencePredicate);
    if (predicates === undefined || predicates.rest.trim().length > 0) {
      return undefined;
    }

    return {
      condition: {
        type: "fieldCount",
        player: "self",
        filter: predicates.filter,
        op: "eq",
        value: 0,
      },
      evidence: fieldCountEvidence(
        "self",
        ["condition:comparator:eq", "condition:threshold:nonNegativeInteger"],
        predicates.evidence,
      ),
      rest: "",
    };
  }

  const noSelfPresence =
    /^you have no\s+(?<predicate>Characters?(?: card)?s?\b.*)$/i.exec(
      input.text,
    );
  const noSelfPredicate = noSelfPresence?.groups?.["predicate"];
  if (noSelfPredicate === undefined) {
    return undefined;
  }

  const predicates = parseFieldPredicates(noSelfPredicate);
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player: "self",
      filter: predicates.filter,
      op: "eq",
      value: 0,
    },
    evidence: fieldCountEvidence(
      "self",
      ["condition:comparator:eq", "condition:threshold:nonNegativeInteger"],
      predicates.evidence,
    ),
    rest: "",
  };
};
