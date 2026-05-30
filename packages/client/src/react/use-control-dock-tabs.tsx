import { useEffect, useState } from "react";

import type { ActionLogCardMention, ActionLogEntry } from "../action-log.js";
import type { BoardViewModel, ClientCardModel } from "../view-model.js";
import { ActionLogContent } from "./ActionLogWindow.js";
import { CardPreviewContent } from "./CardPreviewWindow.js";
import { CollectionModalContent } from "./CollectionModalHost.js";
import { collectionModalFromWindowKey } from "./collection-window-model.js";
import type { ControlDockTab } from "./ControlRail.js";
import {
  actionLogWindowKey,
  cardPreviewWindowKey,
  dockedInfoWindowTabIds,
  groupedInfoWindowIdsAfterTabDragOut,
  infoWindowKey,
  infoWindowKeyForTab,
  settingsWindowKey,
} from "./info-window-model.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";
import type { RevealWindowModel } from "./RevealWindowHost.js";
import { RevealWindowContent } from "./RevealWindowHost.js";
import { SettingsContent } from "./SettingsWindow.js";

export interface ControlDockRevealWindow {
  revealId: string;
  model: RevealWindowModel;
}

export interface UseControlDockTabsInput {
  activeDockedWindowIds: ReadonlySet<string>;
  groupedInfoWindowIds: readonly InfoWindowTabId[];
  visibleInfoWindowIds: readonly InfoWindowTabId[];
  previewCard?: ClientCardModel | undefined;
  showPreviewWindow: boolean;
  showActionLogWindow: boolean;
  showSettingsWindow: boolean;
  actionLogEntries: readonly ActionLogEntry[];
  displayBoard?: BoardViewModel | undefined;
  actionInFlight: boolean;
  opponentRevealWindows: readonly ControlDockRevealWindow[];
  closeCardPreview: () => void;
  setActionLogOpen: (open: boolean) => void;
  setActionLogMinimized: (minimized: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setInfoWindowActiveTab: (tabId: InfoWindowTabId) => void;
  setGroupedInfoWindowIds: (tabIds: InfoWindowTabId[]) => void;
  updateFloatingWindowOpen: (windowKey: string, open: boolean) => void;
  clearCollectionModal: () => void;
  updateCollectionWindowOpen: (windowKey: string, open: boolean) => void;
  dismissRevealWindow: (revealId: string) => void;
  requestRollback: (rollbackPointId: string) => void;
  previewActionLogCard: (card: ActionLogCardMention["card"]) => void;
  previewCardModel: (card: ClientCardModel) => void;
}

export interface UseControlDockTabsResult {
  controlDockTabs: ControlDockTab[];
  controlDockActiveTabId: string | undefined;
  setControlDockActiveTabId: (tabId: string | undefined) => void;
  dockedInfoTabIds: InfoWindowTabId[];
  closeActionLogWindow: () => void;
  closeSettingsWindow: () => void;
  closeDockWindow: (windowKey: string) => void;
}

const revealWindowKey = (revealId: string): string => `reveal:${revealId}`;

export const useControlDockTabs = ({
  activeDockedWindowIds,
  groupedInfoWindowIds,
  visibleInfoWindowIds,
  previewCard,
  showPreviewWindow,
  showActionLogWindow,
  showSettingsWindow,
  actionLogEntries,
  displayBoard,
  actionInFlight,
  opponentRevealWindows,
  closeCardPreview,
  setActionLogOpen,
  setActionLogMinimized,
  setSettingsOpen,
  setInfoWindowActiveTab,
  setGroupedInfoWindowIds,
  updateFloatingWindowOpen,
  clearCollectionModal,
  updateCollectionWindowOpen,
  dismissRevealWindow,
  requestRollback,
  previewActionLogCard,
  previewCardModel,
}: UseControlDockTabsInput): UseControlDockTabsResult => {
  const [controlDockActiveTabId, setControlDockActiveTabId] = useState<
    string | undefined
  >(undefined);
  const dockedInfoTabIds = dockedInfoWindowTabIds(
    activeDockedWindowIds,
    groupedInfoWindowIds,
  ).filter((tabId) => visibleInfoWindowIds.includes(tabId));

  const closeActionLogWindow = (): void => {
    setActionLogOpen(false);
    setActionLogMinimized(false);
    setInfoWindowActiveTab("preview");
    setGroupedInfoWindowIds(
      groupedInfoWindowIdsAfterTabDragOut(groupedInfoWindowIds, "log"),
    );
    updateFloatingWindowOpen(actionLogWindowKey, false);
  };

  const closeSettingsWindow = (): void => {
    setSettingsOpen(false);
    setInfoWindowActiveTab("preview");
    setGroupedInfoWindowIds(
      groupedInfoWindowIdsAfterTabDragOut(groupedInfoWindowIds, "settings"),
    );
    updateFloatingWindowOpen(settingsWindowKey, false);
  };

  const closeDockWindow = (windowKey: string): void => {
    if (windowKey === cardPreviewWindowKey) {
      closeCardPreview();
      return;
    }
    if (windowKey === actionLogWindowKey) {
      closeActionLogWindow();
      return;
    }
    if (windowKey === settingsWindowKey) {
      closeSettingsWindow();
      return;
    }
    if (windowKey.startsWith("collection:")) {
      clearCollectionModal();
      updateCollectionWindowOpen(windowKey, false);
      return;
    }
    if (windowKey.startsWith("reveal:")) {
      dismissRevealWindow(windowKey.slice("reveal:".length));
    }
  };

  const dockTabForWindowKey = (
    windowKey: string,
  ): ControlDockTab | undefined => {
    if (windowKey === cardPreviewWindowKey && showPreviewWindow) {
      return {
        id: windowKey,
        title: "Preview",
        content: <CardPreviewContent card={previewCard} />,
      };
    }
    if (windowKey === actionLogWindowKey && showActionLogWindow) {
      return {
        id: windowKey,
        title: "Log",
        content: (
          <ActionLogContent
            entries={actionLogEntries}
            onRequestRollback={requestRollback}
            onPreviewCard={previewActionLogCard}
          />
        ),
      };
    }
    if (windowKey === settingsWindowKey && showSettingsWindow) {
      return {
        id: windowKey,
        title: "Settings",
        content: <SettingsContent />,
      };
    }
    if (windowKey.startsWith("collection:") && displayBoard !== undefined) {
      const modal = collectionModalFromWindowKey(windowKey, displayBoard);
      if (modal === undefined) {
        return undefined;
      }
      return {
        id: windowKey,
        title: modal.title,
        content: (
          <CollectionModalContent
            model={modal}
            disabled={actionInFlight}
            onPreviewCard={previewCardModel}
          />
        ),
      };
    }
    if (windowKey.startsWith("reveal:")) {
      const revealWindow = opponentRevealWindows.find(
        (window) => revealWindowKey(window.revealId) === windowKey,
      );
      if (revealWindow === undefined) {
        return undefined;
      }
      return {
        id: windowKey,
        title: revealWindow.model.title,
        content: (
          <RevealWindowContent
            model={revealWindow.model}
            onPreviewCard={previewCardModel}
          />
        ),
      };
    }
    return undefined;
  };

  const controlDockTabs = [
    ...new Set(
      [...activeDockedWindowIds].flatMap((windowKey) =>
        windowKey === infoWindowKey
          ? dockedInfoTabIds.map(infoWindowKeyForTab)
          : [windowKey],
      ),
    ),
  ].flatMap((windowKey) => {
    const tab = dockTabForWindowKey(windowKey);
    return tab === undefined ? [] : [tab];
  });

  useEffect(() => {
    if (controlDockTabs.length === 0) {
      if (controlDockActiveTabId !== undefined) {
        setControlDockActiveTabId(undefined);
      }
      return;
    }
    if (
      controlDockActiveTabId === undefined ||
      !controlDockTabs.some((tab) => tab.id === controlDockActiveTabId)
    ) {
      setControlDockActiveTabId(controlDockTabs[0]?.id);
    }
  }, [controlDockActiveTabId, controlDockTabs]);

  return {
    controlDockTabs,
    controlDockActiveTabId,
    setControlDockActiveTabId,
    dockedInfoTabIds,
    closeActionLogWindow,
    closeSettingsWindow,
    closeDockWindow,
  };
};
