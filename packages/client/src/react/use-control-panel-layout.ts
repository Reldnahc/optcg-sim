import { useCallback, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { WindowRect } from "./FloatingWindow.js";
import {
  controlDockSlotRect,
  controlRailWidthFromDrag,
  defaultControlRailWidth,
  resolveControlDockSnapRect,
} from "./control-panel-layout.js";

export interface ControlPanelLayoutController {
  controlRailWidth: number;
  controlDockActive: boolean;
  startControlRailResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  updateControlDockTarget: (rect: WindowRect) => void;
  completeControlDockDrop: (rect: WindowRect) => WindowRect | undefined;
  currentControlDockSlotRect: () => WindowRect | undefined;
}

const elementRect = (selector: string): WindowRect | undefined => {
  if (typeof document === "undefined") {
    return undefined;
  }
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    return undefined;
  }
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

const playmatRightEdge = (fallbackRailWidth: number): number => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return 0;
  }
  const playmatRect = elementRect(".tabletop-board");
  return (
    (playmatRect === undefined
      ? undefined
      : playmatRect.x + playmatRect.width) ??
    Math.max(0, window.innerWidth - fallbackRailWidth - 16)
  );
};

export const useControlPanelLayout = (): ControlPanelLayoutController => {
  const [controlRailWidth, setControlRailWidth] = useState(
    defaultControlRailWidth,
  );
  const [controlDockActive, setControlDockActive] = useState(false);

  const resolveControlDockSnap = useCallback(
    (rect: WindowRect): WindowRect | undefined => {
      const dockRect = elementRect(".control-window-dock");
      return dockRect === undefined
        ? undefined
        : resolveControlDockSnapRect({ rect, dockRect });
    },
    [],
  );

  const currentControlDockSlotRect = useCallback((): WindowRect | undefined => {
    const dockRect = elementRect(".control-window-dock");
    return dockRect === undefined
      ? undefined
      : controlDockSlotRect({ dockRect });
  }, []);

  const updateControlDockTarget = useCallback(
    (rect: WindowRect): void => {
      setControlDockActive(resolveControlDockSnap(rect) !== undefined);
    },
    [resolveControlDockSnap],
  );

  const completeControlDockDrop = useCallback(
    (rect: WindowRect): WindowRect | undefined => {
      setControlDockActive(false);
      return resolveControlDockSnap(rect);
    },
    [resolveControlDockSnap],
  );

  const startControlRailResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      if (typeof document === "undefined" || typeof window === "undefined") {
        return;
      }
      event.preventDefault();
      const startWidth = controlRailWidth;
      const startClientX = event.clientX;
      const move = (moveEvent: PointerEvent): void => {
        setControlRailWidth(
          controlRailWidthFromDrag({
            startWidth,
            startClientX,
            currentClientX: moveEvent.clientX,
            viewportWidth: window.innerWidth,
            playmatRight: playmatRightEdge(startWidth),
          }),
        );
      };
      const stop = (): void => {
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", stop, true);
        document.removeEventListener("pointercancel", stop, true);
      };
      document.addEventListener("pointermove", move, true);
      document.addEventListener("pointerup", stop, true);
      document.addEventListener("pointercancel", stop, true);
    },
    [controlRailWidth],
  );

  return {
    controlRailWidth,
    controlDockActive,
    startControlRailResize,
    updateControlDockTarget,
    completeControlDockDrop,
    currentControlDockSlotRect,
  };
};
