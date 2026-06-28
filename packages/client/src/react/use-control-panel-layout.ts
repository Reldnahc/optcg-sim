import { useCallback, useEffect, useState } from "react";

import type { WindowRect } from "./FloatingWindow.js";
import {
  currentAppViewportMetrics,
  subscribeAppViewportChanges,
} from "./app-viewport.js";
import {
  controlDockSlotRect,
  defaultControlRailWidth,
  normalizeControlPanelLayoutForViewport,
  resolveControlDockSnapRect,
} from "./control-panel-layout.js";

export interface ControlPanelLayoutController {
  controlRailWidth: number;
  controlDockActive: boolean;
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

const playmatRightEdge = (): number => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return 0;
  }
  const playmatRect = elementRect(".tabletop-board");
  return playmatRect === undefined ? 0 : playmatRect.x + playmatRect.width;
};

const controlRailWidthForCurrentViewport = (): number =>
  typeof window === "undefined"
    ? defaultControlRailWidth
    : (() => {
        const viewport = currentAppViewportMetrics();
        return normalizeControlPanelLayoutForViewport({
          layout: {},
          viewportWidth: viewport?.width ?? window.innerWidth,
          viewportHeight: viewport?.height ?? window.innerHeight,
          playmatRight: playmatRightEdge(),
        }).controlRailWidth;
      })();

export const useControlPanelLayout = (): ControlPanelLayoutController => {
  const [controlRailWidth, setControlRailWidth] = useState(() =>
    controlRailWidthForCurrentViewport(),
  );
  const [controlDockActive, setControlDockActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const updateControlRailWidth = (): void => {
      setControlRailWidth(controlRailWidthForCurrentViewport());
    };
    updateControlRailWidth();
    window.addEventListener("resize", updateControlRailWidth);
    const playmatElement = document.querySelector(".tabletop-board");
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(updateControlRailWidth);
    if (playmatElement !== null) {
      resizeObserver?.observe(playmatElement);
    }
    const unsubscribeViewport = subscribeAppViewportChanges(
      updateControlRailWidth,
    );
    return () => {
      window.removeEventListener("resize", updateControlRailWidth);
      unsubscribeViewport();
      resizeObserver?.disconnect();
    };
  }, []);

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

  return {
    controlRailWidth,
    controlDockActive,
    updateControlDockTarget,
    completeControlDockDrop,
    currentControlDockSlotRect,
  };
};
