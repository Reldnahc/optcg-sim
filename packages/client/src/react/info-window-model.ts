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
  const visibleIdSet = new Set(visibleIds);
  const seenIds = new Set<InfoWindowTabId>();
  return groupedIds.filter((id) => {
    if (!visibleIdSet.has(id) || seenIds.has(id)) {
      return false;
    }
    seenIds.add(id);
    return true;
  });
};

export const floatingGroupedInfoWindowIds = ({
  visibleIds,
  groupedIds,
  dockedWindowIds,
}: {
  visibleIds: readonly InfoWindowTabId[];
  groupedIds: readonly InfoWindowTabId[];
  dockedWindowIds: ReadonlySet<string>;
}): InfoWindowTabId[] => {
  const visibleGroupedIds = groupedInfoWindowIds(visibleIds, groupedIds);
  if (dockedWindowIds.has(infoWindowKey)) {
    return visibleGroupedIds;
  }
  const floatingIds = visibleGroupedIds.filter(
    (id) => !dockedWindowIds.has(infoWindowKeyForTab(id)),
  );
  return floatingIds.length >= 2 ? floatingIds : [];
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
  return dockedInfoWindowStateAfterDockTabDragOut(
    currentGroupedInfoWindowIds,
    draggedWindowKey,
  ).groupedIds;
};

export interface DockedInfoWindowDragOutState {
  groupedIds: InfoWindowTabId[];
  replacementDockWindowKeys: string[];
  replacedDockWindowKeys: string[];
}

export const dockedInfoWindowStateAfterDockTabDragOut = (
  currentGroupedInfoWindowIds: readonly InfoWindowTabId[],
  draggedWindowKey: string,
): DockedInfoWindowDragOutState => {
  const draggedTabId = infoWindowTabIdForKey(draggedWindowKey);
  if (
    draggedTabId === undefined ||
    !currentGroupedInfoWindowIds.includes(draggedTabId)
  ) {
    return {
      groupedIds: [...currentGroupedInfoWindowIds],
      replacementDockWindowKeys: [],
      replacedDockWindowKeys: [],
    };
  }
  const remainingIds = currentGroupedInfoWindowIds.filter(
    (windowId) => windowId !== draggedTabId,
  );
  if (remainingIds.length >= 2) {
    return {
      groupedIds: remainingIds,
      replacementDockWindowKeys: [],
      replacedDockWindowKeys: [],
    };
  }
  return {
    groupedIds: [],
    replacementDockWindowKeys: remainingIds.map(infoWindowKeyForTab),
    replacedDockWindowKeys: [infoWindowKey],
  };
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
  if (groupedIdSet.has(draggedWindowId) && !groupedIdSet.has(targetWindowId)) {
    return visibleInfoWindowIds.filter(
      (windowId) => windowId === draggedWindowId || windowId === targetWindowId,
    );
  }
  groupedIdSet.add(draggedWindowId);
  groupedIdSet.add(targetWindowId);
  return visibleInfoWindowIds.filter((windowId) => groupedIdSet.has(windowId));
};

export const dockedInfoWindowTabIds = (
  dockedWindowIds: ReadonlySet<string>,
  currentGroupedInfoWindowIds: readonly InfoWindowTabId[],
): InfoWindowTabId[] => {
  const dockedIds: InfoWindowTabId[] = [];
  const addDockedId = (windowId: InfoWindowTabId): void => {
    if (!dockedIds.includes(windowId)) {
      dockedIds.push(windowId);
    }
  };
  for (const dockedWindowId of dockedWindowIds) {
    if (dockedWindowId === infoWindowKey) {
      for (const windowId of currentGroupedInfoWindowIds) {
        addDockedId(windowId);
      }
      continue;
    }
    const tabId = infoWindowTabIdForKey(dockedWindowId);
    if (tabId !== undefined) {
      addDockedId(tabId);
    }
  }
  return dockedIds;
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
