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
  togglePreviewOpen: () => void;
  toggleActionLogOpen: () => void;
  toggleSettingsOpen: () => void;
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
    setInfoWindowMinimized(false);
    activateInfoWindowTab("preview");
    updateFloatingWindowOpen(cardPreviewWindowKey, true);
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
    togglePreviewOpen() {
      if (previewOpen) {
        closeCardPreview();
        return;
      }
      openCardPreview();
    },
    toggleActionLogOpen() {
      const nextOpen = !actionLogOpen;
      setActionLogOpen(nextOpen);
      updateFloatingWindowOpen(actionLogWindowKey, nextOpen);
      setActionLogMinimized(false);
      setInfoWindowMinimized(false);
      if (nextOpen) {
        activateInfoWindowTab("log");
      }
    },
    toggleSettingsOpen() {
      const nextOpen = !settingsOpen;
      setSettingsOpen(nextOpen);
      updateFloatingWindowOpen(settingsWindowKey, nextOpen);
      if (nextOpen) {
        activateInfoWindowTab("settings");
      }
    },
  };
};
