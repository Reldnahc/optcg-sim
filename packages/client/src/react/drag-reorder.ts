export type ReorderPlacement = "before" | "after";

export interface HorizontalReorderEntry {
  id: string;
  centerX: number;
}

export interface HorizontalReorderTarget {
  targetId: string;
  placement: ReorderPlacement;
}

export interface HorizontalReorderTargetInput {
  entries: readonly HorizontalReorderEntry[];
  draggedId: string;
  clientX: number;
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

export const horizontalReorderTargetFromPointer = ({
  entries,
  draggedId,
  clientX,
}: HorizontalReorderTargetInput): HorizontalReorderTarget | undefined => {
  const draggedIndex = entries.findIndex((entry) => entry.id === draggedId);
  if (draggedIndex === -1 || entries.length <= 1) {
    return undefined;
  }

  let slotIndex = 0;
  while (slotIndex < entries.length - 1) {
    const current = entries[slotIndex];
    const next = entries[slotIndex + 1];
    if (current === undefined || next === undefined) {
      break;
    }
    const boundary = (current.centerX + next.centerX) / 2;
    if (next.centerX >= current.centerX) {
      if (clientX < boundary) {
        break;
      }
    } else if (clientX > boundary) {
      break;
    }
    slotIndex += 1;
  }

  if (slotIndex === draggedIndex) {
    return { targetId: draggedId, placement: "before" };
  }

  const target = entries[slotIndex];
  if (target === undefined) {
    return undefined;
  }
  return {
    targetId: target.id,
    placement: slotIndex < draggedIndex ? "before" : "after",
  };
};
