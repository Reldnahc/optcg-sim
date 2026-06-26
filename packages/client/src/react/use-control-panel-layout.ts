import { useCallback, useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { WindowRect } from "./FloatingWindow.js";
import {
  controlDockSlotRect,
  defaultControlRailWidthForViewport,
  controlRailWidthFromDrag,
  defaultControlRailWidth,
  estimatedCenteredPlaymatRightEdgeForViewport,
  normalizeControlPanelLayoutForViewport,
  resolveControlDockSnapRect,
} from "./control-panel-layout.js";
import type { RevealWindowStateStore } from "./window-state-store.js";

export interface ControlPanelLayoutController {
  controlRailWidth: number;
  controlDockActive: boolean;
  startControlRailResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  updateControlDockTarget: (rect: WindowRect) => void;
  completeControlDockDrop: (rect: WindowRect) => WindowRect | undefined;
  currentControlDockSlotRect: () => WindowRect | undefined;
}

export interface UseControlPanelLayoutInput {
  layoutStore?: RevealWindowStateStore | undefined;
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

const playmatRightEdge = (): number => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return 0;
  }
  const playmatRect = elementRect(".tabletop-board");
  return playmatRect === undefined
    ? estimatedCenteredPlaymatRightEdgeForViewport({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      })
    : playmatRect.x + playmatRect.width;
};

const defaultControlRailWidthForCurrentViewport = (): number =>
  typeof window === "undefined"
    ? defaultControlRailWidth
    : defaultControlRailWidthForViewport({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });

export const useControlPanelLayout = ({
  layoutStore,
}: UseControlPanelLayoutInput = {}): ControlPanelLayoutController => {
  const [controlRailWidth, setControlRailWidth] = useState(() =>
    defaultControlRailWidthForCurrentViewport(),
  );
  const [controlDockActive, setControlDockActive] = useState(false);

  useEffect(() => {
    const layout = layoutStore?.loadControlPanelLayout();
    if (typeof window === "undefined") {
      setControlRailWidth(layout?.controlRailWidth ?? defaultControlRailWidth);
      return;
    }
    const normalizedLayout = normalizeControlPanelLayoutForViewport({
      layout: layout ?? {},
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      playmatRight: playmatRightEdge(),
    });
    setControlRailWidth(normalizedLayout.controlRailWidth);
    if (
      layout !== undefined &&
      layout.controlRailWidth !== undefined &&
      layout.controlRailWidth !== normalizedLayout.controlRailWidth
    ) {
      layoutStore?.saveControlPanelLayout({
        controlRailWidth: normalizedLayout.controlRailWidth,
      });
    }
  }, [layoutStore]);

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
        const nextWidth = controlRailWidthFromDrag({
          startWidth,
          startClientX,
          currentClientX: moveEvent.clientX,
          viewportWidth: window.innerWidth,
          playmatRight: playmatRightEdge(),
        });
        setControlRailWidth(nextWidth);
        layoutStore?.saveControlPanelLayout({
          controlRailWidth: nextWidth,
        });
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
    [controlRailWidth, layoutStore],
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
