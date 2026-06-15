import { useEffect, useState } from "react";

import { moveIdNear, type ReorderPlacement } from "./drag-reorder.js";
import type { WindowRect } from "./FloatingWindow.js";
import {
  combineDropTargetForWindow,
  type GroupableWindow,
} from "./floating-window-grouping.js";
import {
  floatingGroupedInfoWindowIds,
  groupedInfoWindowIdsAfterDrop,
  infoWindowKey,
  infoWindowKeyForTab,
  infoWindowRect,
  standaloneInfoWindowIds as standaloneInfoWindowIdsFromState,
  visibleInfoWindowIds as visibleInfoWindowIdsFromState,
} from "./info-window-model.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";

export interface InfoWindowOrchestration {
  combineDropTarget: InfoWindowTabId | undefined;
  completeInfoGroupDrag: (rect: WindowRect) => WindowRect | undefined;
  completeInfoWindowDrag: (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ) => WindowRect | undefined;
  groupedInfoWindowIds: readonly InfoWindowTabId[];
  groupedInfoWindowRect: WindowRect | undefined;
  dockInfoWindowTabs: (
    draggedWindowIds: readonly InfoWindowTabId[],
    dockRect: WindowRect,
  ) => void;
  reorderInfoWindowTabs: (
    draggedTabId: InfoWindowTabId,
    targetTabId: InfoWindowTabId,
    placement: ReorderPlacement,
  ) => void;
  showTabbedInfoWindow: boolean;
  standaloneInfoWindowIds: readonly InfoWindowTabId[];
  updateInfoWindowDragTargets: (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ) => void;
  visibleInfoWindowIds: readonly InfoWindowTabId[];
}

export const useInfoWindowOrchestration = ({
  activeDockedWindowIds,
  activeFloatingWindowRects,
  configuredGroupedInfoWindowIds,
  dockFloatingWindows,
  completeControlDockDrop,
  openFloatingWindowGroup,
  setActionLogMinimized,
  setControlDockActiveTabId,
  setGroupedInfoWindowIds,
  setInfoWindowActiveTab,
  setInfoWindowMinimized,
  setPreviewMinimized,
  showActionLogWindow,
  showPreviewWindow,
  showSettingsWindow,
  updateControlDockTarget,
}: {
  activeDockedWindowIds: ReadonlySet<string>;
  activeFloatingWindowRects: Readonly<Record<string, WindowRect>>;
  configuredGroupedInfoWindowIds: readonly InfoWindowTabId[];
  dockFloatingWindows: (input: {
    windowKeys: readonly string[];
    rect: WindowRect;
    replacedWindowKeys?: readonly string[] | undefined;
  }) => void;
  completeControlDockDrop: (rect: WindowRect) => WindowRect | undefined;
  openFloatingWindowGroup: (input: {
    windowKey: string;
    rect: WindowRect;
    replacedWindowKeys: readonly string[];
  }) => void;
  setActionLogMinimized: (minimized: boolean) => void;
  setControlDockActiveTabId: (windowKey: string | undefined) => void;
  setGroupedInfoWindowIds: (windowIds: readonly InfoWindowTabId[]) => void;
  setInfoWindowActiveTab: (windowId: InfoWindowTabId) => void;
  setInfoWindowMinimized: (minimized: boolean) => void;
  setPreviewMinimized: (minimized: boolean) => void;
  showActionLogWindow: boolean;
  showPreviewWindow: boolean;
  showSettingsWindow: boolean;
  updateControlDockTarget: (rect: WindowRect) => void;
}): InfoWindowOrchestration => {
  const [combineDropTarget, setCombineDropTarget] = useState<InfoWindowTabId>();
  const visibleInfoWindowIds = visibleInfoWindowIdsFromState({
    showPreviewWindow,
    showActionLogWindow,
    showSettingsWindow,
  });
  const configuredVisibleGroupedInfoWindowIds = floatingGroupedInfoWindowIds({
    visibleIds: visibleInfoWindowIds,
    groupedIds: configuredGroupedInfoWindowIds,
    dockedWindowIds: activeDockedWindowIds,
  });
  const groupedInfoWindowIds =
    configuredVisibleGroupedInfoWindowIds.length >= 2
      ? configuredVisibleGroupedInfoWindowIds
      : [];
  useEffect(() => {
    if (
      configuredGroupedInfoWindowIds.length > 0 &&
      configuredVisibleGroupedInfoWindowIds.length < 2
    ) {
      setGroupedInfoWindowIds([]);
      setCombineDropTarget(undefined);
    }
  }, [
    configuredGroupedInfoWindowIds.length,
    configuredVisibleGroupedInfoWindowIds.length,
    setGroupedInfoWindowIds,
  ]);
  const standaloneInfoWindowIds = standaloneInfoWindowIdsFromState(
    visibleInfoWindowIds,
    groupedInfoWindowIds,
  );
  const showTabbedInfoWindow = groupedInfoWindowIds.length >= 2;
  const groupedInfoWindowRect =
    activeFloatingWindowRects[infoWindowKey] ??
    (groupedInfoWindowIds[0] === undefined
      ? undefined
      : infoWindowRect(groupedInfoWindowIds[0], activeFloatingWindowRects));
  const groupableInfoWindows: GroupableWindow<InfoWindowTabId>[] =
    visibleInfoWindowIds.map((id) => ({
      id,
      visible: true,
      rect:
        groupedInfoWindowIds.includes(id) && groupedInfoWindowRect !== undefined
          ? groupedInfoWindowRect
          : infoWindowRect(id, activeFloatingWindowRects),
    }));
  const matchingCombineDropTarget = (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ): InfoWindowTabId | undefined =>
    combineDropTargetForWindow(draggedWindowId, rect, groupableInfoWindows);
  const updateCombineDropTarget = (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ): void => {
    setCombineDropTarget(matchingCombineDropTarget(draggedWindowId, rect));
  };
  const updateInfoWindowDragTargets = (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ): void => {
    updateCombineDropTarget(draggedWindowId, rect);
    updateControlDockTarget(rect);
  };
  const tryGroupInfoWindow = (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ): boolean => {
    const targetWindowId = matchingCombineDropTarget(draggedWindowId, rect);
    setCombineDropTarget(undefined);
    if (targetWindowId === undefined) {
      return false;
    }
    const targetRect =
      groupedInfoWindowIds.includes(targetWindowId) &&
      groupedInfoWindowRect !== undefined
        ? groupedInfoWindowRect
        : infoWindowRect(targetWindowId, activeFloatingWindowRects);
    const nextGroupedInfoWindowIds = groupedInfoWindowIdsAfterDrop({
      visibleInfoWindowIds,
      currentGroupedInfoWindowIds: groupedInfoWindowIds,
      draggedWindowId,
      targetWindowId,
    });
    openFloatingWindowGroup({
      windowKey: infoWindowKey,
      rect: targetRect,
      replacedWindowKeys: nextGroupedInfoWindowIds.map(infoWindowKeyForTab),
    });
    setInfoWindowActiveTab(draggedWindowId);
    setInfoWindowMinimized(false);
    setPreviewMinimized(false);
    setActionLogMinimized(false);
    setGroupedInfoWindowIds(nextGroupedInfoWindowIds);
    return true;
  };
  const dockInfoWindowTabs = (
    draggedWindowIds: readonly InfoWindowTabId[],
    dockRect: WindowRect,
  ): void => {
    const windowKeys = draggedWindowIds.map(infoWindowKeyForTab);
    dockFloatingWindows({
      windowKeys,
      rect: dockRect,
      replacedWindowKeys: [infoWindowKey],
    });
    setControlDockActiveTabId(windowKeys[0]);
    setInfoWindowActiveTab(
      draggedWindowIds[0] ?? groupedInfoWindowIds[0] ?? "preview",
    );
    setInfoWindowMinimized(false);
    setPreviewMinimized(false);
    setActionLogMinimized(false);
  };
  const completeInfoWindowDrag = (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ): WindowRect | undefined => {
    const dockRect = completeControlDockDrop(rect);
    if (dockRect === undefined) {
      return tryGroupInfoWindow(draggedWindowId, rect) ? undefined : rect;
    }
    dockInfoWindowTabs([draggedWindowId], dockRect);
    setCombineDropTarget(undefined);
    return undefined;
  };
  const completeInfoGroupDrag = (rect: WindowRect): WindowRect | undefined => {
    const dockRect = completeControlDockDrop(rect);
    if (dockRect === undefined) {
      return rect;
    }
    dockInfoWindowTabs(groupedInfoWindowIds, dockRect);
    setCombineDropTarget(undefined);
    return undefined;
  };
  const reorderInfoWindowTabs = (
    draggedTabId: InfoWindowTabId,
    targetTabId: InfoWindowTabId,
    placement: ReorderPlacement,
  ): void => {
    setGroupedInfoWindowIds(
      moveIdNear(groupedInfoWindowIds, draggedTabId, targetTabId, placement),
    );
    setInfoWindowActiveTab(draggedTabId);
  };
  return {
    combineDropTarget,
    completeInfoGroupDrag,
    completeInfoWindowDrag,
    dockInfoWindowTabs,
    groupedInfoWindowIds,
    groupedInfoWindowRect,
    reorderInfoWindowTabs,
    showTabbedInfoWindow,
    standaloneInfoWindowIds,
    updateInfoWindowDragTargets,
    visibleInfoWindowIds,
  };
};
