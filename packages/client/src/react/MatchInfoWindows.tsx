import type { ActionLogCardMention, ActionLogEntry } from "../action-log.js";
import type { ClientCardModel } from "../view-model.js";
import type { ComponentProps } from "react";
import {
  ActionLogWindow,
  defaultActionLogWindowRect,
} from "./ActionLogWindow.js";
import {
  CardPreviewWindow,
  defaultCardPreviewWindowRect,
} from "./CardPreviewWindow.js";
import type { WindowRect } from "./FloatingWindow.js";
import {
  actionLogWindowKey,
  cardPreviewWindowKey,
  groupedInfoWindowIdsAfterTabDragOut,
  infoWindowKey,
  settingsWindowKey,
} from "./info-window-model.js";
import { InfoTabbedWindow } from "./InfoTabbedWindow.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";
import { defaultSettingsWindowRect, SettingsWindow } from "./SettingsWindow.js";

export interface MatchInfoWindowsProps {
  actionLogEntries: readonly ActionLogEntry[];
  actionLogMinimized: boolean;
  activeDockedWindowIds: ReadonlySet<string>;
  activeFloatingWindowRects: Readonly<Record<string, WindowRect>>;
  activeFloatingWindowZIndexes: Readonly<Record<string, number>>;
  combineDropTarget: InfoWindowTabId | undefined;
  dockedInfoTabIds: readonly InfoWindowTabId[];
  groupedInfoWindowIds: readonly InfoWindowTabId[];
  infoWindowActiveTab: InfoWindowTabId;
  infoWindowMinimized: boolean;
  previewCard: ClientCardModel | undefined;
  previewMinimized: boolean;
  showActionLogWindow: boolean;
  showSettingsWindow: boolean;
  showTabbedInfoWindow: boolean;
  standaloneInfoWindowIds: readonly InfoWindowTabId[];
  activateFloatingWindow: (windowKey: string) => void;
  closeActionLogWindow: () => void;
  closeCardPreview: () => void;
  closeSettingsWindow: () => void;
  completeInfoGroupDrag: (rect: WindowRect) => WindowRect | undefined;
  completeInfoWindowDrag: (
    windowId: InfoWindowTabId,
    rect: WindowRect,
  ) => WindowRect | undefined;
  onRequestRollback: (rollbackPointId: string) => void;
  onPreviewActionLogCard: (card: ActionLogCardMention["card"]) => void;
  reorderInfoWindowTabs: (
    draggedTabId: InfoWindowTabId,
    targetTabId: InfoWindowTabId,
    placement: "before" | "after",
  ) => void;
  setActionLogMinimized: (updater: (current: boolean) => boolean) => void;
  setActionLogOpen: (open: boolean) => void;
  setGroupedInfoWindowIds: (windowIds: readonly InfoWindowTabId[]) => void;
  setInfoWindowActiveTab: (windowId: InfoWindowTabId) => void;
  setInfoWindowMinimized: (updater: (current: boolean) => boolean) => void;
  setPreviewMinimized: (updater: (current: boolean) => boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  splitInfoWindowTab: (
    tabId: InfoWindowTabId,
    point: Parameters<
      NonNullable<ComponentProps<typeof InfoTabbedWindow>["onTabDragOut"]>
    >[1],
  ) => void;
  updateControlDockTarget: (rect: WindowRect) => void;
  updateFloatingWindowOpen: (windowKey: string, open: boolean) => void;
  updateFloatingWindowRect: (windowKey: string, rect: WindowRect) => void;
  updateInfoWindowDragTargets: (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ) => void;
}

export const MatchInfoWindows = ({
  actionLogEntries,
  actionLogMinimized,
  activeDockedWindowIds,
  activeFloatingWindowRects,
  activeFloatingWindowZIndexes,
  activateFloatingWindow,
  closeActionLogWindow,
  closeCardPreview,
  closeSettingsWindow,
  combineDropTarget,
  completeInfoGroupDrag,
  completeInfoWindowDrag,
  dockedInfoTabIds,
  groupedInfoWindowIds,
  infoWindowActiveTab,
  infoWindowMinimized,
  onPreviewActionLogCard,
  onRequestRollback,
  previewCard,
  previewMinimized,
  reorderInfoWindowTabs,
  setActionLogMinimized,
  setActionLogOpen,
  setGroupedInfoWindowIds,
  setInfoWindowActiveTab,
  setInfoWindowMinimized,
  setPreviewMinimized,
  setSettingsOpen,
  showActionLogWindow,
  showSettingsWindow,
  showTabbedInfoWindow,
  splitInfoWindowTab,
  standaloneInfoWindowIds,
  updateControlDockTarget,
  updateFloatingWindowOpen,
  updateFloatingWindowRect,
  updateInfoWindowDragTargets,
}: MatchInfoWindowsProps): React.JSX.Element => (
  <>
    {showTabbedInfoWindow && !activeDockedWindowIds.has(infoWindowKey) ? (
      <InfoTabbedWindow
        previewCard={previewCard}
        entries={actionLogEntries}
        logOpen={showActionLogWindow}
        settingsOpen={showSettingsWindow}
        tabIds={groupedInfoWindowIds}
        className={
          combineDropTarget !== undefined &&
          groupedInfoWindowIds.includes(combineDropTarget)
            ? "is-combine-drop-target"
            : undefined
        }
        activeTabId={infoWindowActiveTab}
        minimized={infoWindowMinimized}
        initialRect={
          activeFloatingWindowRects[infoWindowKey] ??
          activeFloatingWindowRects[actionLogWindowKey] ??
          activeFloatingWindowRects[cardPreviewWindowKey]
        }
        zIndex={activeFloatingWindowZIndexes[infoWindowKey]}
        onActiveTabChange={setInfoWindowActiveTab}
        onActivate={() => {
          activateFloatingWindow(infoWindowKey);
        }}
        onToggleMinimized={() => {
          setInfoWindowMinimized((current) => !current);
        }}
        onCloseActiveTab={(tabId) => {
          if (tabId === "preview") {
            closeCardPreview();
            return;
          }
          if (tabId === "settings") {
            setSettingsOpen(false);
            setInfoWindowActiveTab("preview");
            setGroupedInfoWindowIds(
              groupedInfoWindowIdsAfterTabDragOut(
                groupedInfoWindowIds,
                "settings",
              ),
            );
            updateFloatingWindowOpen(settingsWindowKey, false);
            return;
          }
          setActionLogOpen(false);
          setActionLogMinimized(() => false);
          setInfoWindowActiveTab("preview");
          setGroupedInfoWindowIds(
            groupedInfoWindowIdsAfterTabDragOut(groupedInfoWindowIds, "log"),
          );
          updateFloatingWindowOpen(actionLogWindowKey, false);
        }}
        onRectChange={(rect) => {
          updateFloatingWindowRect(infoWindowKey, rect);
        }}
        onDragMove={updateControlDockTarget}
        onDragEnd={completeInfoGroupDrag}
        onTabDragOut={splitInfoWindowTab}
        onTabReorder={reorderInfoWindowTabs}
        onRequestRollback={onRequestRollback}
        onPreviewCard={onPreviewActionLogCard}
      />
    ) : null}
    {standaloneInfoWindowIds.includes("log") &&
    !dockedInfoTabIds.includes("log") ? (
      <ActionLogWindow
        entries={actionLogEntries}
        className={
          combineDropTarget === "log" ? "is-combine-drop-target" : undefined
        }
        minimized={actionLogMinimized}
        initialRect={
          activeFloatingWindowRects[actionLogWindowKey] ??
          defaultActionLogWindowRect
        }
        zIndex={activeFloatingWindowZIndexes[actionLogWindowKey]}
        onToggleMinimized={() => {
          setActionLogMinimized((current) => !current);
        }}
        onClose={closeActionLogWindow}
        onActivate={() => {
          activateFloatingWindow(actionLogWindowKey);
        }}
        onRectChange={(rect) => {
          updateFloatingWindowRect(actionLogWindowKey, rect);
        }}
        onDragMove={(rect) => {
          updateInfoWindowDragTargets("log", rect);
        }}
        onDragEnd={(rect) => completeInfoWindowDrag("log", rect)}
        onRequestRollback={onRequestRollback}
        onPreviewCard={onPreviewActionLogCard}
      />
    ) : null}
    {standaloneInfoWindowIds.includes("preview") &&
    !dockedInfoTabIds.includes("preview") ? (
      <CardPreviewWindow
        card={previewCard}
        className={
          combineDropTarget === "preview" ? "is-combine-drop-target" : undefined
        }
        minimized={previewMinimized}
        initialRect={
          activeFloatingWindowRects[cardPreviewWindowKey] ??
          defaultCardPreviewWindowRect
        }
        zIndex={activeFloatingWindowZIndexes[cardPreviewWindowKey]}
        onToggleMinimized={() => {
          setPreviewMinimized((current) => !current);
        }}
        onClose={closeCardPreview}
        onActivate={() => {
          activateFloatingWindow(cardPreviewWindowKey);
        }}
        onRectChange={(rect) => {
          updateFloatingWindowRect(cardPreviewWindowKey, rect);
        }}
        onDragMove={(rect) => {
          updateInfoWindowDragTargets("preview", rect);
        }}
        onDragEnd={(rect) => completeInfoWindowDrag("preview", rect)}
      />
    ) : null}
    {standaloneInfoWindowIds.includes("settings") &&
    !dockedInfoTabIds.includes("settings") ? (
      <SettingsWindow
        className={
          combineDropTarget === "settings"
            ? "is-combine-drop-target"
            : undefined
        }
        initialRect={
          activeFloatingWindowRects[settingsWindowKey] ??
          defaultSettingsWindowRect
        }
        onClose={closeSettingsWindow}
        zIndex={activeFloatingWindowZIndexes[settingsWindowKey]}
        onActivate={() => {
          activateFloatingWindow(settingsWindowKey);
        }}
        onRectChange={(rect) => {
          updateFloatingWindowRect(settingsWindowKey, rect);
        }}
        onDragMove={(rect) => {
          updateInfoWindowDragTargets("settings", rect);
        }}
        onDragEnd={(rect) => completeInfoWindowDrag("settings", rect)}
      />
    ) : null}
  </>
);
