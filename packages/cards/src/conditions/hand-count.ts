import type { ConditionParseResult, ConditionParser } from "../types.js";

export const parseHandCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const difference =
    /^the number of cards in your hand is at least (?<value>[1-9]\d*) less than the number in your opponent's hand$/iu.exec(
      input.text,
    );
  const differenceValue = difference?.groups?.["value"];
  if (differenceValue !== undefined) {
    return {
      condition: {
        type: "handCountDifference",
        minuend: { player: "opponent" },
        subtrahend: { player: "self" },
        op: "gte",
        value: Number.parseInt(differenceValue, 10),
      },
      evidence: [
        "condition:handCountDifference",
        "player:opponent",
        "player:self",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "valueOffset:handCountDifference",
      ],
      rest: "",
    };
  }

  const match =
    /^(?<subject>you|your opponent) (?<verb>have|has) (?<count>\d+)(?: or (?<direction>more|less))? cards in (?<owner>your|their) hand$/i.exec(
      input.text,
    );
  const subjectText = match?.groups?.["subject"]?.toLowerCase();
  const verbText = match?.groups?.["verb"]?.toLowerCase();
  const countText = match?.groups?.["count"];
  const directionText = match?.groups?.["direction"]?.toLowerCase();
  const ownerText = match?.groups?.["owner"]?.toLowerCase();
  if (
    subjectText === undefined ||
    verbText === undefined ||
    countText === undefined ||
    ownerText === undefined
  ) {
    return undefined;
  }

  const player = subjectText === "you" ? "self" : "opponent";
  if (
    (player === "self" && (verbText !== "have" || ownerText !== "your")) ||
    (player === "opponent" && (verbText !== "has" || ownerText !== "their"))
  ) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);
  const op =
    directionText === undefined
      ? "eq"
      : directionText === "more"
        ? "gte"
        : "lte";

  return {
    condition: {
      type: "handCount",
      player,
      op,
      value: count,
    },
    evidence: [
      "condition:handCount",
      op === "gte"
        ? "condition:comparator:gte"
        : op === "lte"
          ? "condition:comparator:lte"
          : "condition:comparator:eq",
      count === 0
        ? "condition:threshold:nonNegativeInteger"
        : "condition:threshold:positiveInteger",
      player === "self" ? "player:self" : "player:opponent",
    ],
    rest: "",
  };
};
