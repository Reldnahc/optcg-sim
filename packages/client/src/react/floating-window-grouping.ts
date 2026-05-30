import type { WindowRect } from "./FloatingWindow.js";

export interface WindowPoint {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export const rectsOverlap = (first: WindowRect, second: WindowRect): boolean =>
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y;

export const splitWindowRectFromPoint = (
  point: WindowPoint,
  size: WindowSize,
): WindowRect => ({
  x: Math.max(0, point.x - size.width / 2),
  y: Math.max(0, point.y - 20),
  width: size.width,
  height: size.height,
});
