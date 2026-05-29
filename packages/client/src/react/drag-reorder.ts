export type ReorderPlacement = "before" | "after";

export interface OriginalReorderSlotInput {
  clientX: number;
  originalLeft: number;
  originalWidth: number;
  neighborCenterXs: readonly number[];
}

export const moveIdNear = <T extends string>(
  ids: readonly T[],
  draggedId: T,
  targetId: T,
  placement: ReorderPlacement,
): T[] => {
  if (draggedId === targetId || !ids.includes(draggedId)) {
    return [...ids];
  }
  const withoutDragged = ids.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex === -1) {
    return [...ids];
  }
  const insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
  return [
    ...withoutDragged.slice(0, insertIndex),
    draggedId,
    ...withoutDragged.slice(insertIndex),
  ];
};

export const reorderPlacementFromPointer = (
  rect: DOMRect,
  clientX: number,
  clientY: number,
  orientationRect: DOMRect = rect,
): ReorderPlacement => {
  const horizontal = orientationRect.width >= orientationRect.height;
  const midpoint = horizontal
    ? rect.left + rect.width / 2
    : rect.top + rect.height / 2;
  const value = horizontal ? clientX : clientY;
  return value < midpoint ? "before" : "after";
};

export const isPointerInOriginalHorizontalSlot = ({
  clientX,
  originalLeft,
  originalWidth,
  neighborCenterXs,
}: OriginalReorderSlotInput): boolean => {
  const originalCenterX = originalLeft + originalWidth / 2;
  const nearestNeighborDistance =
    neighborCenterXs.length === 0
      ? originalWidth
      : Math.min(
          ...neighborCenterXs.map((centerX) =>
            Math.abs(centerX - originalCenterX),
          ),
        );
  const halfSlotWidth = Math.max(
    4,
    Math.min(originalWidth / 2, nearestNeighborDistance / 2),
  );
  return Math.abs(clientX - originalCenterX) <= halfSlotWidth;
};
