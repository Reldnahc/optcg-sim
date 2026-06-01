import type { ConditionParseResult, ConditionParser } from "../types.js";

export const parseHandCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const match =
    /^(?<subject>you|your opponent) (?<verb>have|has) (?<count>[1-9]\d*) or (?<direction>more|less) cards in (?<owner>your|their) hand$/i.exec(
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
    directionText === undefined ||
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
  const op = directionText === "more" ? "gte" : "lte";

  return {
    condition: {
      type: "handCount",
      player,
      op,
      value: Number.parseInt(countText, 10),
    },
    evidence: [
      "condition:handCount",
      op === "gte" ? "condition:comparator:gte" : "condition:comparator:lte",
      "condition:threshold:positiveInteger",
      player === "self" ? "player:self" : "player:opponent",
    ],
    rest: "",
  };
};
