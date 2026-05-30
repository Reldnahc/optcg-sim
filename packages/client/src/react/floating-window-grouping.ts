import type { WindowRect } from "./FloatingWindow.js";

export interface WindowPoint {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface GroupableWindow<WindowId extends string = string> {
  id: WindowId;
  visible: boolean;
  rect: WindowRect;
}

export const minimumWindowMergeOverlapRatio = 0.35;

export const rectsOverlap = (first: WindowRect, second: WindowRect): boolean =>
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y;

const rectArea = (rect: WindowRect): number => rect.width * rect.height;

export const rectOverlapRatio = (
  first: WindowRect,
  second: WindowRect,
): number => {
  const overlapWidth =
    Math.min(first.x + first.width, second.x + second.width) -
    Math.max(first.x, second.x);
  const overlapHeight =
    Math.min(first.y + first.height, second.y + second.height) -
    Math.max(first.y, second.y);
  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }
  return (
    (overlapWidth * overlapHeight) / Math.min(rectArea(first), rectArea(second))
  );
};

export const rectsMeaningfullyOverlap = (
  first: WindowRect,
  second: WindowRect,
): boolean => rectOverlapRatio(first, second) >= minimumWindowMergeOverlapRatio;

export const combineDropTargetForWindow = <WindowId extends string>(
  draggedWindowId: WindowId,
  draggedRect: WindowRect,
  windows: readonly GroupableWindow<WindowId>[],
): WindowId | undefined =>
  windows.find(
    (window) =>
      window.id !== draggedWindowId &&
      window.visible &&
      rectsMeaningfullyOverlap(draggedRect, window.rect),
  )?.id;

export const splitWindowRectFromPoint = (
  point: WindowPoint,
  size: WindowSize,
): WindowRect => ({
  x: Math.max(0, point.x - size.width / 2),
  y: Math.max(0, point.y - 20),
  width: size.width,
  height: size.height,
});
