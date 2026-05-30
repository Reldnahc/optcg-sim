import type { WindowRect } from "./FloatingWindow.js";
import { infoWindowKey, infoWindowTabIdForKey } from "./info-window-model.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";
import { usePoppedOutWindowDrag } from "./use-popped-out-window-drag.js";

export interface RoutedPoppedOutWindowDragOptions {
  onRectChange: (windowKey: string, rect: WindowRect) => void;
  onControlWindowDragMove: (rect: WindowRect) => void;
  onDockableWindowDragEnd: (
    windowKey: string,
    rect: WindowRect,
  ) => WindowRect | undefined;
  onInfoWindowDragMove: (tabId: InfoWindowTabId, rect: WindowRect) => void;
  onInfoWindowDragEnd: (
    tabId: InfoWindowTabId,
    rect: WindowRect,
  ) => WindowRect | undefined;
  onInfoGroupDragEnd: (rect: WindowRect) => WindowRect | undefined;
}

export const useRoutedPoppedOutWindowDrag = ({
  onRectChange,
  onControlWindowDragMove,
  onDockableWindowDragEnd,
  onInfoWindowDragMove,
  onInfoWindowDragEnd,
  onInfoGroupDragEnd,
}: RoutedPoppedOutWindowDragOptions): ReturnType<
  typeof usePoppedOutWindowDrag
> =>
  usePoppedOutWindowDrag({
    onRectChange,
    onDragMove(windowKey, rect) {
      const infoTabId = infoWindowTabIdForKey(windowKey);
      if (infoTabId === undefined) {
        onControlWindowDragMove(rect);
        return;
      }
      onInfoWindowDragMove(infoTabId, rect);
    },
    onDragEnd(windowKey, rect) {
      if (windowKey === infoWindowKey) {
        return onInfoGroupDragEnd(rect);
      }
      const infoTabId = infoWindowTabIdForKey(windowKey);
      return infoTabId === undefined
        ? onDockableWindowDragEnd(windowKey, rect)
        : onInfoWindowDragEnd(infoTabId, rect);
    },
  });
