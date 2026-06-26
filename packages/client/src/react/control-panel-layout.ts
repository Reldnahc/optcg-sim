import type { WindowRect } from "./FloatingWindow.js";
import { rectsMeaningfullyOverlap } from "./floating-window-grouping.js";

export const defaultControlRailWidth = 260;
export const minControlRailWidth = 220;
export const controlRailRightInset = 8;
export const controlRailPlaymatGap = 8;

const desktopCardMinHeight = 86;
const desktopCardMaxHeight = 240;
const desktopCardViewportHeightRatio = 0.135;
const desktopCardViewportWidthRatio = 0.12;
const controlRailDefaultMinWidth = 248;
const controlRailDefaultMaxWidth = 380;

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const desktopCardHeightForViewport = ({
  viewportWidth,
  viewportHeight,
}: {
  viewportWidth: number;
  viewportHeight: number;
}): number =>
  clampNumber(
    Math.min(
      viewportHeight * desktopCardViewportHeightRatio,
      viewportWidth * desktopCardViewportWidthRatio,
    ),
    desktopCardMinHeight,
    desktopCardMaxHeight,
  );

export const defaultControlRailWidthForViewport = ({
  viewportWidth,
  viewportHeight,
}: {
  viewportWidth: number;
  viewportHeight: number;
}): number => {
  const cardWidth =
    desktopCardHeightForViewport({ viewportWidth, viewportHeight }) / 1.4;
  return Math.round(
    clampNumber(
      cardWidth * 2.7,
      controlRailDefaultMinWidth,
      controlRailDefaultMaxWidth,
    ),
  );
};

export interface ControlRailWidthInput {
  requestedWidth: number;
  viewportWidth: number;
  playmatRight: number;
}

export interface ControlPanelLayoutInput {
  controlRailWidth?: number | undefined;
}

export interface NormalizedControlPanelLayout {
  controlRailWidth: number;
}

export interface ControlPanelLayoutViewportInput {
  layout: ControlPanelLayoutInput;
  viewportWidth: number;
  viewportHeight: number;
  playmatRight: number;
}

export const maxControlRailWidth = ({
  viewportWidth,
  playmatRight,
}: Pick<ControlRailWidthInput, "viewportWidth" | "playmatRight">): number =>
  playmatRight <= 0
    ? controlRailDefaultMaxWidth
    : Math.max(
        minControlRailWidth,
        viewportWidth -
          controlRailRightInset -
          playmatRight -
          controlRailPlaymatGap,
      );

export const normalizeControlPanelLayoutForViewport = ({
  viewportWidth,
  playmatRight,
}: ControlPanelLayoutViewportInput): NormalizedControlPanelLayout => ({
  controlRailWidth: maxControlRailWidth({ viewportWidth, playmatRight }),
});

export const controlDockSlotRect = ({
  dockRect,
}: {
  dockRect: WindowRect;
}): WindowRect => dockRect;

export const resolveControlDockSnapRect = ({
  rect,
  dockRect,
}: {
  rect: WindowRect;
  dockRect: WindowRect;
}): WindowRect | undefined =>
  rectsMeaningfullyOverlap(rect, dockRect)
    ? controlDockSlotRect({ dockRect })
    : undefined;

export const resizeDockedWindowRects = ({
  rects,
  dockedWindowIds,
  dockRect,
}: {
  rects: Readonly<Record<string, WindowRect>>;
  dockedWindowIds: ReadonlySet<string>;
  dockRect: WindowRect;
}): Record<string, WindowRect> => {
  const nextRects = { ...rects };
  const dockSlotRect = controlDockSlotRect({ dockRect });
  for (const windowId of dockedWindowIds) {
    if (nextRects[windowId] !== undefined) {
      nextRects[windowId] = dockSlotRect;
    }
  }
  return nextRects;
};
