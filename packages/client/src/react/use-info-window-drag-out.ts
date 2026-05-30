import { dockWindowPoppedOutSize } from "./dock-window-popout.js";
import type { WindowRect } from "./FloatingWindow.js";
import { splitWindowRectFromPoint } from "./floating-window-grouping.js";
import {
  actionLogWindowKey,
  dockedInfoWindowStateAfterDockTabDragOut,
  groupedInfoWindowIdsAfterTabDragOut,
  infoWindowDefaultSize,
  infoWindowKey,
  infoWindowKeyForTab,
  infoWindowRect,
  settingsWindowKey,
} from "./info-window-model.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";
import type { TabDragOutPoint } from "./TabbedFloatingWindow.js";
import { useRoutedPoppedOutWindowDrag } from "./use-routed-popped-out-window-drag.js";

export interface InfoWindowDragOutControls {
  dragOutDockGroup: (point: TabDragOutPoint) => void;
  dragOutDockWindow: (windowKey: string, point: TabDragOutPoint) => void;
  splitInfoWindowTab: (tabId: InfoWindowTabId, point: TabDragOutPoint) => void;
}

export interface UseInfoWindowDragOutInput {
  activeFloatingWindowRects: Readonly<Record<string, WindowRect>>;
  dockedInfoTabIds: readonly InfoWindowTabId[];
  groupedInfoWindowIds: readonly InfoWindowTabId[];
  currentControlDockSlotRect: () => WindowRect | undefined;
  updateFloatingWindowRect: (windowKey: string, rect: WindowRect) => void;
  updateFloatingWindowOpen: (windowKey: string, open: boolean) => void;
  setControlDockActiveTabId: (windowKey: string | undefined) => void;
  setGroupedInfoWindowIds: (windowIds: readonly InfoWindowTabId[]) => void;
  setInfoWindowActiveTab: (windowId: InfoWindowTabId) => void;
  setInfoWindowMinimized: (minimized: boolean) => void;
  setActionLogOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  onControlWindowDragMove: (rect: WindowRect) => void;
  onDockableWindowDragEnd: (
    windowKey: string,
    rect: WindowRect,
  ) => WindowRect | undefined;
  onInfoWindowDragMove: (windowId: InfoWindowTabId, rect: WindowRect) => void;
  onInfoWindowDragEnd: (
    windowId: InfoWindowTabId,
    rect: WindowRect,
  ) => WindowRect | undefined;
  onInfoGroupDragEnd: (rect: WindowRect) => WindowRect | undefined;
  onDockInfoWindowGroupSplit: (input: {
    windowKeys: readonly string[];
    rect: WindowRect;
    replacedWindowKeys: readonly string[];
  }) => void;
}

export const useInfoWindowDragOut = ({
  activeFloatingWindowRects,
  dockedInfoTabIds,
  groupedInfoWindowIds,
  currentControlDockSlotRect,
  updateFloatingWindowRect,
  updateFloatingWindowOpen,
  setControlDockActiveTabId,
  setGroupedInfoWindowIds,
  setInfoWindowActiveTab,
  setInfoWindowMinimized,
  setActionLogOpen,
  setSettingsOpen,
  onControlWindowDragMove,
  onDockableWindowDragEnd,
  onInfoWindowDragMove,
  onInfoWindowDragEnd,
  onInfoGroupDragEnd,
  onDockInfoWindowGroupSplit,
}: UseInfoWindowDragOutInput): InfoWindowDragOutControls => {
  const startPoppedOutDrag = useRoutedPoppedOutWindowDrag({
    onRectChange: updateFloatingWindowRect,
    onControlWindowDragMove,
    onDockableWindowDragEnd,
    onInfoWindowDragMove,
    onInfoWindowDragEnd,
    onInfoGroupDragEnd,
  });

  const dragOutDockGroup = (point: TabDragOutPoint): void => {
    if (dockedInfoTabIds.length < 2) {
      return;
    }
    const dockRect = currentControlDockSlotRect();
    const poppedOutSize =
      dockRect === undefined
        ? infoWindowDefaultSize(dockedInfoTabIds[0] ?? "preview")
        : { width: dockRect.width, height: dockRect.height };
    const nextRect = splitWindowRectFromPoint(point, poppedOutSize);
    for (const tabId of dockedInfoTabIds) {
      updateFloatingWindowRect(infoWindowKeyForTab(tabId), nextRect);
    }
    updateFloatingWindowRect(infoWindowKey, nextRect);
    setGroupedInfoWindowIds(dockedInfoTabIds);
    setInfoWindowActiveTab(dockedInfoTabIds[0] ?? "preview");
    setInfoWindowMinimized(false);
    setControlDockActiveTabId(undefined);
    startPoppedOutDrag({
      pointerId: point.pointerId,
      windowKey: infoWindowKey,
      offsetX: poppedOutSize.width / 2,
      offsetY: 20,
      width: poppedOutSize.width,
      height: poppedOutSize.height,
    });
  };

  const dragOutDockWindow = (
    windowKey: string,
    point: TabDragOutPoint,
  ): void => {
    const dockedSize = dockWindowPoppedOutSize(windowKey);
    const nextRect = splitWindowRectFromPoint(point, dockedSize);
    const dockDragOutState = dockedInfoWindowStateAfterDockTabDragOut(
      groupedInfoWindowIds,
      windowKey,
    );
    updateFloatingWindowRect(windowKey, nextRect);
    updateFloatingWindowOpen(windowKey, true);
    setControlDockActiveTabId(undefined);
    setGroupedInfoWindowIds(dockDragOutState.groupedIds);
    const dockRect = currentControlDockSlotRect();
    if (
      dockRect !== undefined &&
      dockDragOutState.replacementDockWindowKeys.length > 0
    ) {
      onDockInfoWindowGroupSplit({
        windowKeys: dockDragOutState.replacementDockWindowKeys,
        rect: dockRect,
        replacedWindowKeys: dockDragOutState.replacedDockWindowKeys,
      });
    }
    startPoppedOutDrag({
      pointerId: point.pointerId,
      windowKey,
      offsetX: dockedSize.width / 2,
      offsetY: 20,
      width: dockedSize.width,
      height: dockedSize.height,
    });
  };

  const splitInfoWindowTab = (
    tabId: InfoWindowTabId,
    point: TabDragOutPoint,
  ): void => {
    const windowKey = infoWindowKeyForTab(tabId);
    const remainingGroupedWindowIds = groupedInfoWindowIdsAfterTabDragOut(
      groupedInfoWindowIds,
      tabId,
    );
    const remainingWindowId =
      remainingGroupedWindowIds[0] ??
      groupedInfoWindowIds.find((windowId) => windowId !== tabId);
    const groupRect =
      activeFloatingWindowRects[infoWindowKey] ??
      infoWindowRect(tabId, activeFloatingWindowRects);
    if (
      remainingGroupedWindowIds.length === 0 &&
      remainingWindowId !== undefined
    ) {
      updateFloatingWindowRect(
        infoWindowKeyForTab(remainingWindowId),
        groupRect,
      );
    }
    const poppedOutSize = infoWindowDefaultSize(tabId);
    const poppedOutRect = splitWindowRectFromPoint(point, poppedOutSize);
    updateFloatingWindowRect(windowKey, poppedOutRect);
    startPoppedOutDrag({
      pointerId: point.pointerId,
      windowKey,
      offsetX: poppedOutSize.width / 2,
      offsetY: 20,
      width: poppedOutSize.width,
      height: poppedOutSize.height,
    });
    setGroupedInfoWindowIds(remainingGroupedWindowIds);
    setInfoWindowMinimized(false);
    setInfoWindowActiveTab(remainingWindowId ?? tabId);
    if (tabId === "log") {
      setActionLogOpen(true);
      updateFloatingWindowOpen(actionLogWindowKey, true);
    }
    if (tabId === "settings") {
      setSettingsOpen(true);
      updateFloatingWindowOpen(settingsWindowKey, true);
    }
  };

  return {
    dragOutDockGroup,
    dragOutDockWindow,
    splitInfoWindowTab,
  };
};
