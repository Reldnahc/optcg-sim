import type { Effect } from "@optcg/types";

export const isSupportedPowerEffectValue = (
  value: Extract<Effect, { type: "modifyPower" }>["value"],
): boolean => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value);
  }
  if (value.type === "sumSelectedCardCosts") {
    return Number.isSafeInteger(value.multiplier) && value.multiplier > 0;
  }
  if (value.type === "countDistinctMatchingFieldNames") {
    return (
      value.player === "self" &&
      Number.isSafeInteger(value.multiplier) &&
      value.multiplier > 0 &&
      value.filter.custom === "differentNames"
    );
  }
  if (value.type === "paidCostCardCount") {
    return (
      value.cost.length > 0 &&
      Number.isSafeInteger(value.multiplier) &&
      value.multiplier > 0
    );
  }
  if (value.type === "countAttachedDon") {
    return (
      Number.isSafeInteger(value.per) &&
      value.per > 0 &&
      Number.isSafeInteger(value.multiplier) &&
      value.multiplier !== 0 &&
      (value.target.type === "self" ||
        value.target.type === "affectedCard" ||
        value.target.type === "myLeader" ||
        value.target.type === "opponentLeader" ||
        value.target.type === "savedFieldObject")
    );
  }
  if (value.type === "savedNumber") {
    return false;
  }
  if (value.type === "countMatchingZoneCardsAcrossPlayers") {
    return (
      value.filter === undefined &&
      value.players.length > 0 &&
      value.players.every(
        (player) => player === "self" || player === "opponent",
      ) &&
      Number.isSafeInteger(value.per) &&
      value.per > 0 &&
      Number.isSafeInteger(value.multiplier) &&
      value.multiplier !== 0
    );
  }
  if (value.type !== "countMatchingZoneCards") {
    return false;
  }
  return (
    value.player === "self" &&
    Number.isSafeInteger(value.per) &&
    value.per > 0 &&
    Number.isSafeInteger(value.multiplier) &&
    value.multiplier !== 0
  );
};
