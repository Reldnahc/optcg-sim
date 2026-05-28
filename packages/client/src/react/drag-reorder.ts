export type ReorderPlacement = "before" | "after";

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
): ReorderPlacement => {
  const horizontal = rect.width >= rect.height;
  const midpoint = horizontal
    ? rect.left + rect.width / 2
    : rect.top + rect.height / 2;
  const value = horizontal ? clientX : clientY;
  return value < midpoint ? "before" : "after";
};
