import type { WindowRect } from "./FloatingWindow.js";

export interface RevealWindowState {
  scope?: string | undefined;
  dismissed: Set<string>;
  minimized: Set<string>;
}

export interface FloatingWindowRectState {
  scope?: string | undefined;
  rects: Record<string, WindowRect>;
  openWindowIds: Set<string>;
}

export const emptyRevealWindowState: RevealWindowState = {
  dismissed: new Set(),
  minimized: new Set(),
};

export const emptyFloatingWindowRectState: FloatingWindowRectState = {
  rects: {},
  openWindowIds: new Set(),
};
