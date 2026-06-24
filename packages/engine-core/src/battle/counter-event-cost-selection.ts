import type { OptionalCost } from "@optcg/types";

export const counterEventEffectCostSelectionCountIsAllowed = (
  cost: Extract<OptionalCost, { type: "trashFromHand" }>,
  selectedCount: number,
  availableCount: number,
): boolean => {
  const maxCount =
    cost.maxCount === undefined
      ? cost.count === 0
        ? availableCount
        : cost.count
      : cost.maxCount === "available"
        ? availableCount
        : cost.maxCount;
  return selectedCount >= cost.count && selectedCount <= maxCount;
};
