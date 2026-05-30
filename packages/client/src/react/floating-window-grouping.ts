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

export const rectsOverlap = (first: WindowRect, second: WindowRect): boolean =>
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y;

export const combineDropTargetForWindow = <WindowId extends string>(
  draggedWindowId: WindowId,
  draggedRect: WindowRect,
  windows: readonly GroupableWindow<WindowId>[],
): WindowId | undefined =>
  windows.find(
    (window) =>
      window.id !== draggedWindowId &&
      window.visible &&
      rectsOverlap(draggedRect, window.rect),
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
