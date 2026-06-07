import type { ClientCardModel } from "../view-model.js";
import {
  actionLogWindowKey,
  cardPreviewWindowKey,
  groupedInfoWindowIdsAfterTabDragOut,
  infoWindowKey,
  infoWindowKeyForTab,
  settingsWindowKey,
} from "./info-window-model.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";

export interface InfoWindowToolbarControls {
  previewHoveredCard: (card: ClientCardModel) => void;
  showCardPreview: (card: ClientCardModel) => void;
  closeCardPreview: () => void;
  focusPreviewWindow: () => void;
  focusActionLogWindow: () => void;
  focusSettingsWindow: () => void;
}

export interface InfoWindowToolbarControlsInput {
  previewOpen: boolean;
  actionLogOpen: boolean;
  settingsOpen: boolean;
  activeDockedWindowIds: ReadonlySet<string>;
  configuredGroupedInfoWindowIds: readonly InfoWindowTabId[];
  setPreviewCard: (card: ClientCardModel | undefined) => void;
  setPreviewOpen: (open: boolean) => void;
  setPreviewMinimized: (minimized: boolean) => void;
  setActionLogOpen: (open: boolean) => void;
  setActionLogMinimized: (minimized: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setInfoWindowMinimized: (minimized: boolean) => void;
  setInfoWindowActiveTab: (tabId: InfoWindowTabId) => void;
  setGroupedInfoWindowIds: (tabIds: readonly InfoWindowTabId[]) => void;
  setControlDockActiveTabId: (windowKey: string | undefined) => void;
  updateFloatingWindowOpen: (windowKey: string, open: boolean) => void;
}

export const createInfoWindowToolbarControls = ({
  previewOpen,
  actionLogOpen,
  settingsOpen,
  activeDockedWindowIds,
  configuredGroupedInfoWindowIds,
  setPreviewCard,
  setPreviewOpen,
  setPreviewMinimized,
  setActionLogOpen,
  setActionLogMinimized,
  setSettingsOpen,
  setInfoWindowMinimized,
  setInfoWindowActiveTab,
  setGroupedInfoWindowIds,
  setControlDockActiveTabId,
  updateFloatingWindowOpen,
}: InfoWindowToolbarControlsInput): InfoWindowToolbarControls => {
  const activateInfoWindowTab = (tabId: InfoWindowTabId): void => {
    const windowKey = infoWindowKeyForTab(tabId);
    setInfoWindowActiveTab(tabId);
    if (
      activeDockedWindowIds.has(infoWindowKey) ||
      activeDockedWindowIds.has(windowKey)
    ) {
      setControlDockActiveTabId(windowKey);
    }
  };

  const tabOpen = (tabId: InfoWindowTabId): boolean => {
    if (tabId === "preview") return previewOpen;
    if (tabId === "log") return actionLogOpen;
    return settingsOpen;
  };

  const floatingGroupVisibleAfterFocus = (tabId: InfoWindowTabId): boolean => {
    if (
      activeDockedWindowIds.has(infoWindowKey) ||
      activeDockedWindowIds.has(infoWindowKeyForTab(tabId)) ||
      !configuredGroupedInfoWindowIds.includes(tabId)
    ) {
      return false;
    }
    return (
      configuredGroupedInfoWindowIds.filter(
        (candidate) => candidate === tabId || tabOpen(candidate),
      ).length >= 2
    );
  };

  const focusInfoWindow = ({
    tabId,
    windowKey,
  }: {
    tabId: InfoWindowTabId;
    windowKey: string;
  }): void => {
    activateInfoWindowTab(tabId);
    setInfoWindowMinimized(false);
    updateFloatingWindowOpen(windowKey, true);
    if (floatingGroupVisibleAfterFocus(tabId)) {
      updateFloatingWindowOpen(infoWindowKey, true);
    }
  };

  const closeCardPreview = (): void => {
    setPreviewOpen(false);
    setPreviewMinimized(false);
    setInfoWindowActiveTab("log");
    setGroupedInfoWindowIds(
      groupedInfoWindowIdsAfterTabDragOut(
        configuredGroupedInfoWindowIds,
        "preview",
      ),
    );
    updateFloatingWindowOpen(cardPreviewWindowKey, false);
  };

  const openCardPreview = (): void => {
    setPreviewOpen(true);
    setPreviewMinimized(false);
    focusInfoWindow({ tabId: "preview", windowKey: cardPreviewWindowKey });
  };

  return {
    previewHoveredCard(card) {
      setPreviewCard(card);
    },
    showCardPreview(card) {
      setPreviewCard(card);
      openCardPreview();
    },
    closeCardPreview,
    focusPreviewWindow() {
      openCardPreview();
    },
    focusActionLogWindow() {
      setActionLogOpen(true);
      setActionLogMinimized(false);
      focusInfoWindow({ tabId: "log", windowKey: actionLogWindowKey });
    },
    focusSettingsWindow() {
      setSettingsOpen(true);
      focusInfoWindow({ tabId: "settings", windowKey: settingsWindowKey });
    },
  };
};
