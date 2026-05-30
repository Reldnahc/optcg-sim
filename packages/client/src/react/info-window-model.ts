import { defaultActionLogWindowRect } from "./ActionLogWindow.js";
import { defaultCardPreviewWindowRect } from "./CardPreviewWindow.js";
import type { WindowRect } from "./FloatingWindow.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";
import { defaultSettingsWindowRect } from "./SettingsWindow.js";

export const cardPreviewWindowKey = "card-preview";
export const actionLogWindowKey = "action-log";
export const settingsWindowKey = "settings";
export const infoWindowKey = "info-window";

export const infoWindowTabIds: readonly InfoWindowTabId[] = [
  "preview",
  "log",
  "settings",
];

export const isInfoWindowTabId = (tabId: string): tabId is InfoWindowTabId =>
  tabId === "preview" || tabId === "log" || tabId === "settings";

export const infoWindowKeyForTab = (tabId: InfoWindowTabId): string => {
  switch (tabId) {
    case "preview":
      return cardPreviewWindowKey;
    case "log":
      return actionLogWindowKey;
    case "settings":
      return settingsWindowKey;
  }
};

export const infoWindowTabIdForKey = (
  windowKey: string,
): InfoWindowTabId | undefined => {
  switch (windowKey) {
    case cardPreviewWindowKey:
      return "preview";
    case actionLogWindowKey:
      return "log";
    case settingsWindowKey:
      return "settings";
    default:
      return undefined;
  }
};

export const visibleInfoWindowIds = ({
  showPreviewWindow,
  showActionLogWindow,
  showSettingsWindow,
}: {
  showPreviewWindow: boolean;
  showActionLogWindow: boolean;
  showSettingsWindow: boolean;
}): InfoWindowTabId[] => [
  ...(showPreviewWindow ? (["preview"] as const) : []),
  ...(showActionLogWindow ? (["log"] as const) : []),
  ...(showSettingsWindow ? (["settings"] as const) : []),
];

export const groupedInfoWindowIds = (
  visibleIds: readonly InfoWindowTabId[],
  groupedIds: readonly InfoWindowTabId[],
): InfoWindowTabId[] => {
  const groupedIdSet = new Set(groupedIds);
  return visibleIds.filter((id) => groupedIdSet.has(id));
};

export const standaloneInfoWindowIds = (
  visibleIds: readonly InfoWindowTabId[],
  groupedIds: readonly InfoWindowTabId[],
): InfoWindowTabId[] => {
  const groupedIdSet = new Set(groupedIds);
  return visibleIds.filter((id) => !groupedIdSet.has(id));
};

export const groupedInfoWindowIdsAfterTabDragOut = (
  currentGroupedInfoWindowIds: readonly InfoWindowTabId[],
  draggedTabId: InfoWindowTabId,
): InfoWindowTabId[] => {
  const remainingIds = currentGroupedInfoWindowIds.filter(
    (windowId) => windowId !== draggedTabId,
  );
  return remainingIds.length >= 2 ? remainingIds : [];
};

export const groupedInfoWindowIdsAfterDockTabDragOut = (
  currentGroupedInfoWindowIds: readonly InfoWindowTabId[],
  draggedWindowKey: string,
): InfoWindowTabId[] => {
  const draggedTabId = infoWindowTabIdForKey(draggedWindowKey);
  return draggedTabId === undefined
    ? [...currentGroupedInfoWindowIds]
    : groupedInfoWindowIdsAfterTabDragOut(
        currentGroupedInfoWindowIds,
        draggedTabId,
      );
};

export const groupedInfoWindowIdsAfterDrop = ({
  visibleInfoWindowIds,
  currentGroupedInfoWindowIds,
  draggedWindowId,
  targetWindowId,
}: {
  visibleInfoWindowIds: readonly InfoWindowTabId[];
  currentGroupedInfoWindowIds: readonly InfoWindowTabId[];
  draggedWindowId: InfoWindowTabId;
  targetWindowId: InfoWindowTabId;
}): InfoWindowTabId[] => {
  const groupedIdSet = new Set(currentGroupedInfoWindowIds);
  groupedIdSet.add(draggedWindowId);
  groupedIdSet.add(targetWindowId);
  return visibleInfoWindowIds.filter((windowId) => groupedIdSet.has(windowId));
};

export const dockedInfoWindowTabIds = (
  dockedWindowIds: ReadonlySet<string>,
  currentGroupedInfoWindowIds: readonly InfoWindowTabId[],
): InfoWindowTabId[] => {
  const dockedIds = new Set<InfoWindowTabId>();
  if (dockedWindowIds.has(infoWindowKey)) {
    for (const windowId of currentGroupedInfoWindowIds) {
      dockedIds.add(windowId);
    }
  }
  for (const windowId of infoWindowTabIds) {
    if (dockedWindowIds.has(infoWindowKeyForTab(windowId))) {
      dockedIds.add(windowId);
    }
  }
  return infoWindowTabIds.filter((windowId) => dockedIds.has(windowId));
};

export const groupedInfoWindowIdsAfterDockDrop = ({
  visibleInfoWindowIds,
  currentGroupedInfoWindowIds,
  dockedWindowIds,
  draggedWindowIds,
}: {
  visibleInfoWindowIds: readonly InfoWindowTabId[];
  currentGroupedInfoWindowIds: readonly InfoWindowTabId[];
  dockedWindowIds: ReadonlySet<string>;
  draggedWindowIds: readonly InfoWindowTabId[];
}):
  | {
      groupedIds: InfoWindowTabId[];
      replacedWindowKeys: string[];
    }
  | undefined => {
  const draggedIdSet = new Set(draggedWindowIds);
  const dockedIds = dockedInfoWindowTabIds(
    dockedWindowIds,
    currentGroupedInfoWindowIds,
  ).filter((windowId) => !draggedIdSet.has(windowId));
  if (dockedIds.length === 0) {
    return undefined;
  }
  const groupedIdSet = new Set([
    ...currentGroupedInfoWindowIds,
    ...dockedIds,
    ...draggedWindowIds,
  ]);
  const groupedIds = visibleInfoWindowIds.filter((windowId) =>
    groupedIdSet.has(windowId),
  );
  if (groupedIds.length < 2) {
    return undefined;
  }
  const replacedWindowKeySet = new Set<string>([
    ...(dockedWindowIds.has(infoWindowKey) ? [infoWindowKey] : []),
    ...dockedIds.map(infoWindowKeyForTab),
    ...draggedWindowIds.map(infoWindowKeyForTab),
  ]);
  return {
    groupedIds,
    replacedWindowKeys: [...replacedWindowKeySet],
  };
};

export const defaultInfoWindowRect = (
  windowId: InfoWindowTabId,
): WindowRect => {
  switch (windowId) {
    case "preview":
      return defaultCardPreviewWindowRect;
    case "log":
      return defaultActionLogWindowRect;
    case "settings":
      return defaultSettingsWindowRect;
  }
};

export const infoWindowDefaultSize = (
  windowId: InfoWindowTabId,
): { width: number; height: number } => {
  const rect = defaultInfoWindowRect(windowId);
  return { width: rect.width, height: rect.height };
};

export const infoWindowRect = (
  windowId: InfoWindowTabId,
  rects: Readonly<Record<string, WindowRect>>,
): WindowRect =>
  rects[infoWindowKeyForTab(windowId)] ?? defaultInfoWindowRect(windowId);
