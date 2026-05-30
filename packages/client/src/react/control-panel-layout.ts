import type { WindowRect } from "./FloatingWindow.js";
import { rectsOverlap } from "./floating-window-grouping.js";

export const defaultControlRailWidth = 260;
export const minControlRailWidth = 220;
export const controlRailRightInset = 8;
export const controlRailPlaymatGap = 8;
export const defaultControlDockHeight = 320;
export const minControlDockHeight = 180;
export const controlDockVerticalReservedSpace = 160;

export interface ControlRailWidthInput {
  requestedWidth: number;
  viewportWidth: number;
  playmatRight: number;
}

export const maxControlRailWidth = ({
  viewportWidth,
  playmatRight,
}: Pick<ControlRailWidthInput, "viewportWidth" | "playmatRight">): number =>
  Math.max(
    minControlRailWidth,
    viewportWidth -
      controlRailRightInset -
      playmatRight -
      controlRailPlaymatGap,
  );

export const clampControlRailWidth = ({
  requestedWidth,
  viewportWidth,
  playmatRight,
}: ControlRailWidthInput): number =>
  Math.min(
    Math.max(minControlRailWidth, requestedWidth),
    maxControlRailWidth({ viewportWidth, playmatRight }),
  );

export const controlRailWidthFromDrag = ({
  startWidth,
  startClientX,
  currentClientX,
  viewportWidth,
  playmatRight,
}: {
  startWidth: number;
  startClientX: number;
  currentClientX: number;
  viewportWidth: number;
  playmatRight: number;
}): number =>
  clampControlRailWidth({
    requestedWidth: startWidth + startClientX - currentClientX,
    viewportWidth,
    playmatRight,
  });

export const maxControlDockHeight = ({
  controlPanelHeight,
}: {
  controlPanelHeight: number;
}): number =>
  Math.max(
    minControlDockHeight,
    controlPanelHeight - controlDockVerticalReservedSpace,
  );

export const clampControlDockHeight = ({
  requestedHeight,
  controlPanelHeight,
}: {
  requestedHeight: number;
  controlPanelHeight: number;
}): number =>
  Math.min(
    Math.max(minControlDockHeight, requestedHeight),
    maxControlDockHeight({ controlPanelHeight }),
  );

export const controlDockHeightFromDrag = ({
  startHeight,
  startClientY,
  currentClientY,
  controlPanelHeight,
}: {
  startHeight: number;
  startClientY: number;
  currentClientY: number;
  controlPanelHeight: number;
}): number =>
  clampControlDockHeight({
    requestedHeight: startHeight + startClientY - currentClientY,
    controlPanelHeight,
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
  rectsOverlap(rect, dockRect) ? controlDockSlotRect({ dockRect }) : undefined;

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
