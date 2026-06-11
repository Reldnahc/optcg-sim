import type { ConditionParser } from "../types.js";

export const parseEventHistoryCondition: ConditionParser = (input) => {
  const match =
    /^you have activated an Event with a base cost of (?<cost>[1-9]\d*) or more during this turn$/iu.exec(
      input.text.trim(),
    );
  const costText = match?.groups?.["cost"];
  if (costText === undefined) {
    return undefined;
  }

  const cost = Number.parseInt(costText, 10);
  if (!Number.isSafeInteger(cost) || cost <= 0) {
    return undefined;
  }

  return {
    condition: {
      type: "eventHistory",
      event: "cardPlayed",
      player: "self",
      filter: {
        categories: ["event"],
        baseCost: { op: "gte", value: cost },
      },
      window: "thisTurn",
      op: "gte",
      value: 1,
    },
    evidence: [
      "condition:eventHistory",
      "event:cardPlayed",
      "player:self",
      "filter:category:event",
      "filter:baseCost",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "duration:thisTurn",
    ],
    rest: "",
  };
};
