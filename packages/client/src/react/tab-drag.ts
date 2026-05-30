import {
  horizontalReorderTargetFromPointer,
  type HorizontalReorderEntry,
  type HorizontalReorderTarget,
} from "./drag-reorder.js";

export interface TabDragPoint {
  x: number;
  y: number;
}

export interface TabDragRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type TabDragIntent = "reorder" | "dragOut";

export const tabDragRectFromElement = (element: Element): TabDragRect => {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
  };
};

export const tabDragIntentFromPoint = ({
  point,
  tabStripRect,
}: {
  point: TabDragPoint;
  tabStripRect: TabDragRect;
}): TabDragIntent =>
  point.x >= tabStripRect.left &&
  point.x <= tabStripRect.right &&
  point.y >= tabStripRect.top &&
  point.y <= tabStripRect.bottom
    ? "reorder"
    : "dragOut";

export const tabReorderEntriesFromTabList = (
  tabListElement: Element,
): HorizontalReorderEntry[] =>
  [...tabListElement.querySelectorAll<HTMLElement>("[data-tab-id]")].flatMap(
    (tabElement) => {
      const id = tabElement.dataset["tabId"];
      if (id === undefined) {
        return [];
      }
      const rect = tabElement.getBoundingClientRect();
      return [{ id, centerX: rect.left + rect.width / 2 }];
    },
  );

export const tabReorderTargetFromPointer = ({
  entries,
  draggedId,
  clientX,
}: {
  entries: readonly HorizontalReorderEntry[];
  draggedId: string;
  clientX: number;
}): HorizontalReorderTarget | undefined =>
  horizontalReorderTargetFromPointer({ entries, draggedId, clientX });
