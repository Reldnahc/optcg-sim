import { defaultActionLogWindowRect } from "./ActionLogWindow.js";
import { defaultCardPreviewWindowRect } from "./CardPreviewWindow.js";
import type { WindowRect } from "./FloatingWindow.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";
import { defaultSettingsWindowRect } from "./SettingsWindow.js";

export const cardPreviewWindowKey = "card-preview";
export const actionLogWindowKey = "action-log";
export const settingsWindowKey = "settings";
export const infoWindowKey = "info-window";

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
