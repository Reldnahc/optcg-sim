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
  if (
    parsed === undefined ||
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

export const parseFieldCardCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
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

  const selfPresence = /^you have an?\s+(?<predicate>.+)$/i.exec(input.text);
  const selfPresencePredicate = selfPresence?.groups?.["predicate"];
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
    const comparison = parseLeadingCountComparison({ text: comparisonText });
    if (comparison !== undefined) {
      const predicates = parseFieldPredicates(comparison.rest);
      if (predicates !== undefined && predicates.rest.trim().length === 0) {
        return {
          condition: {
            type: "fieldCount",
            player: "self",
            filter: predicates.filter,
            op: comparison.op,
            value: comparison.value,
          },
          evidence: fieldCountEvidence(
            "self",
            comparison.evidence,
            predicates.evidence,
          ),
          rest: "",
        };
      }
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
