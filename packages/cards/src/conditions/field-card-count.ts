import { parseCardFilterPredicates } from "../filters/index.js";
import type {
  ConditionParseResult,
  ConditionParser,
  PrimitiveEvidence,
} from "../types.js";

const parseFieldPredicates = (text: string) =>
  parseCardFilterPredicates({ text }, { powerSemantics: "current" });

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
