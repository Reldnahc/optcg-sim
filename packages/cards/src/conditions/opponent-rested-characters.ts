import type { ConditionParser } from "../types.js";

export const parseOpponentRestedCharactersCondition: ConditionParser = (
  input,
) => {
  const match =
    /^your opponent has (?<count>[1-9]\d*) or more rested Characters$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player: "opponent",
      filter: {
        categories: ["character"],
        state: "rested",
      },
      op: "gte",
      value: Number.parseInt(countText, 10),
    },
    evidence: [
      "condition:opponentFieldCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:opponent",
    ],
    rest: "",
  };
};
