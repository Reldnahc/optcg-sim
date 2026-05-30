import { useCallback, useEffect, useRef, useState } from "react";

import type { WindowRect } from "./FloatingWindow.js";

export interface PoppedOutDragState {
  pointerId: number;
  windowKey: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface PoppedOutWindowDragOptions {
  onRectChange: (windowKey: string, rect: WindowRect) => void;
  onDragMove?: ((windowKey: string, rect: WindowRect) => void) | undefined;
  onDragEnd?:
    | ((windowKey: string, rect: WindowRect) => WindowRect | undefined)
    | undefined;
}

export const usePoppedOutWindowDrag = ({
  onRectChange,
  onDragMove,
  onDragEnd,
}: PoppedOutWindowDragOptions): ((drag: PoppedOutDragState) => void) => {
  const cleanupRef = useRef<(() => void) | undefined>(undefined);
  const [poppedOutDrag, setPoppedOutDrag] = useState<
    PoppedOutDragState | undefined
  >(undefined);

  const clearListeners = useCallback((): void => {
    cleanupRef.current?.();
    cleanupRef.current = undefined;
  }, []);

  const startPoppedOutDrag = useCallback(
    (drag: PoppedOutDragState): void => {
      clearListeners();
      setPoppedOutDrag(drag);
      if (typeof document === "undefined") {
        return;
      }

      const movePoppedOutWindowTo = (
        clientX: number,
        clientY: number,
      ): WindowRect => {
        const nextRect = {
          x: Math.max(0, clientX - drag.offsetX),
          y: Math.max(0, clientY - drag.offsetY),
          width: drag.width,
          height: drag.height,
        };
        onRectChange(drag.windowKey, nextRect);
        onDragMove?.(drag.windowKey, nextRect);
        return nextRect;
      };
      const movePoppedOutWindow = (event: PointerEvent): void => {
        if (event.pointerId !== drag.pointerId) {
          return;
        }
        movePoppedOutWindowTo(event.clientX, event.clientY);
      };
      const movePoppedOutWindowFromMouse = (event: MouseEvent): void => {
        movePoppedOutWindowTo(event.clientX, event.clientY);
      };
      const stopPoppedOutDrag = (event: PointerEvent): void => {
        if (event.pointerId !== drag.pointerId) {
          return;
        }
        const droppedRect = {
          x: Math.max(0, event.clientX - drag.offsetX),
          y: Math.max(0, event.clientY - drag.offsetY),
          width: drag.width,
          height: drag.height,
        };
        const resolvedRect = onDragEnd?.(drag.windowKey, droppedRect);
        if (resolvedRect !== undefined) {
          onRectChange(drag.windowKey, resolvedRect);
        }
        clearListeners();
        setPoppedOutDrag(undefined);
      };
      const stopPoppedOutDragFromMouse = (event: MouseEvent): void => {
        const droppedRect = {
          x: Math.max(0, event.clientX - drag.offsetX),
          y: Math.max(0, event.clientY - drag.offsetY),
          width: drag.width,
          height: drag.height,
        };
        const resolvedRect = onDragEnd?.(drag.windowKey, droppedRect);
        if (resolvedRect !== undefined) {
          onRectChange(drag.windowKey, resolvedRect);
        }
        clearListeners();
        setPoppedOutDrag(undefined);
      };
      const cleanup = (): void => {
        document.removeEventListener("pointermove", movePoppedOutWindow, true);
        document.removeEventListener("pointerup", stopPoppedOutDrag, true);
        document.removeEventListener(
          "mousemove",
          movePoppedOutWindowFromMouse,
          true,
        );
        document.removeEventListener(
          "mouseup",
          stopPoppedOutDragFromMouse,
          true,
        );
      };
      cleanupRef.current = cleanup;
      document.addEventListener("pointermove", movePoppedOutWindow, true);
      document.addEventListener("pointerup", stopPoppedOutDrag, true);
      document.addEventListener(
        "mousemove",
        movePoppedOutWindowFromMouse,
        true,
      );
      document.addEventListener("mouseup", stopPoppedOutDragFromMouse, true);
    },
    [clearListeners, onDragEnd, onDragMove, onRectChange],
  );

  useEffect(() => {
    if (poppedOutDrag === undefined) {
      return undefined;
    }
    return () => {
      clearListeners();
    };
  }, [clearListeners, poppedOutDrag]);

  return startPoppedOutDrag;
};
