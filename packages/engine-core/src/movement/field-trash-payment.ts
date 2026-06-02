import type { CardInstance } from "@optcg/types";

export const selectedFieldTrashSourceZone = (
  selectedCards: readonly CardInstance[],
): "characterArea" | "stageArea" | null => {
  const sourceZones = new Set(
    selectedCards.map((card) =>
      card.zone.zone === "characterArea" || card.zone.zone === "stageArea"
        ? card.zone.zone
        : null,
    ),
  );
  if (sourceZones.size !== 1) {
    return null;
  }
  const sourceZone = [...sourceZones][0];
  return sourceZone === "characterArea" || sourceZone === "stageArea"
    ? sourceZone
    : null;
};
