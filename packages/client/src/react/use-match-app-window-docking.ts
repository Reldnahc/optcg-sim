import { moveIdNear, type ReorderPlacement } from "./drag-reorder.js";
import type { WindowRect } from "./FloatingWindow.js";
import { infoWindowKey, infoWindowTabIdForKey } from "./info-window-model.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";
import { useInfoWindowDragOut } from "./use-info-window-drag-out.js";
import type { InfoWindowDragOutControls } from "./use-info-window-drag-out.js";

export interface UseMatchAppWindowDockingInput {
  activeDockedWindowIds: ReadonlySet<string>;
  activeFloatingWindowRects: Readonly<Record<string, WindowRect>>;
  completeControlDockDrop: (rect: WindowRect) => WindowRect | undefined;
  completeDockableWindowDrag: (
    windowKey: string,
    rect: WindowRect,
  ) => WindowRect | undefined;
  completeInfoWindowDrag: (
    windowId: InfoWindowTabId,
    rect: WindowRect,
  ) => WindowRect | undefined;
  currentControlDockSlotRect: () => WindowRect | undefined;
  dockedInfoTabIds: readonly InfoWindowTabId[];
  dockFloatingWindows: (input: {
    windowKeys: readonly string[];
    rect: WindowRect;
    replacedWindowKeys?: readonly string[] | undefined;
  }) => void;
  dockInfoWindowTabs: (
    draggedWindowIds: readonly InfoWindowTabId[],
    dockRect: WindowRect,
  ) => void;
  groupedInfoWindowIds: readonly InfoWindowTabId[];
  reorderDockedWindow: (
    draggedWindowKey: string,
    targetWindowKey: string,
    placement: ReorderPlacement,
  ) => void;
  setActionLogOpen: (open: boolean) => void;
  setControlDockActiveTabId: (windowKey: string | undefined) => void;
  setGroupedInfoWindowIds: (windowIds: readonly InfoWindowTabId[]) => void;
  setInfoWindowActiveTab: (windowId: InfoWindowTabId) => void;
  setInfoWindowMinimized: (minimized: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  updateControlDockTarget: (rect: WindowRect) => void;
  updateFloatingWindowOpen: (windowKey: string, open: boolean) => void;
  updateFloatingWindowRect: (windowKey: string, rect: WindowRect) => void;
  updateInfoWindowDragTargets: (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ) => void;
}

export interface MatchAppWindowDocking {
  dragOutDockGroup: InfoWindowDragOutControls["dragOutDockGroup"];
  dragOutDockWindow: InfoWindowDragOutControls["dragOutDockWindow"];
  reorderDockTab: (
    draggedWindowKey: string,
    targetWindowKey: string,
    placement: ReorderPlacement,
  ) => void;
  splitInfoWindowTab: InfoWindowDragOutControls["splitInfoWindowTab"];
}

export const useMatchAppWindowDocking = ({
  activeDockedWindowIds,
  activeFloatingWindowRects,
  completeControlDockDrop,
  completeDockableWindowDrag,
  completeInfoWindowDrag,
  currentControlDockSlotRect,
  dockedInfoTabIds,
  dockFloatingWindows,
  dockInfoWindowTabs,
  groupedInfoWindowIds,
  reorderDockedWindow,
  setActionLogOpen,
  setControlDockActiveTabId,
  setGroupedInfoWindowIds,
  setInfoWindowActiveTab,
  setInfoWindowMinimized,
  setSettingsOpen,
  updateControlDockTarget,
  updateFloatingWindowOpen,
  updateFloatingWindowRect,
  updateInfoWindowDragTargets,
}: UseMatchAppWindowDockingInput): MatchAppWindowDocking => {
  const reorderDockTab = (
    draggedWindowKey: string,
    targetWindowKey: string,
    placement: ReorderPlacement,
  ): void => {
    const draggedInfoTabId = infoWindowTabIdForKey(draggedWindowKey);
    const targetInfoTabId = infoWindowTabIdForKey(targetWindowKey);
    if (
      draggedInfoTabId !== undefined &&
      targetInfoTabId !== undefined &&
      activeDockedWindowIds.has(infoWindowKey) &&
      dockedInfoTabIds.includes(draggedInfoTabId) &&
      dockedInfoTabIds.includes(targetInfoTabId)
    ) {
      setGroupedInfoWindowIds(
        moveIdNear(
          dockedInfoTabIds,
          draggedInfoTabId,
          targetInfoTabId,
          placement,
        ),
      );
      setInfoWindowActiveTab(draggedInfoTabId);
    }
    reorderDockedWindow(draggedWindowKey, targetWindowKey, placement);
    setControlDockActiveTabId(draggedWindowKey);
  };

  const completePoppedOutInfoGroupDrag = (
    rect: WindowRect,
  ): WindowRect | undefined => {
    const dockRect = completeControlDockDrop(rect);
    if (dockRect === undefined) {
      return undefined;
    }
    dockInfoWindowTabs(
      dockedInfoTabIds.length >= 2 ? dockedInfoTabIds : groupedInfoWindowIds,
      dockRect,
    );
    return undefined;
  };

  const { dragOutDockGroup, dragOutDockWindow, splitInfoWindowTab } =
    useInfoWindowDragOut({
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
      onControlWindowDragMove: updateControlDockTarget,
      onDockableWindowDragEnd: completeDockableWindowDrag,
      onInfoWindowDragMove: updateInfoWindowDragTargets,
      onInfoWindowDragEnd: completeInfoWindowDrag,
      onInfoGroupDragEnd: completePoppedOutInfoGroupDrag,
      onDockInfoWindowGroupSplit: ({
        windowKeys,
        rect,
        replacedWindowKeys,
      }) => {
        dockFloatingWindows({
          windowKeys,
          rect,
          replacedWindowKeys,
        });
      },
    });

  return {
    dragOutDockGroup,
    dragOutDockWindow,
    reorderDockTab,
    splitInfoWindowTab,
  };
};
