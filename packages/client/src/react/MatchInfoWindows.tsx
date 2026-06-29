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
  completeInfoGroupDrag: (rect: WindowRect) => WindowRect | undefined;
  completeInfoWindowDrag: (
    windowId: InfoWindowTabId,
    rect: WindowRect,
  ) => WindowRect | undefined;
  dockInfoWindowTabs: (windowIds: readonly InfoWindowTabId[]) => void;
  onRequestRollback: (rollbackPointId: string) => void;
  onPreviewActionLogCard: (card: ActionLogCardMention["card"]) => void;
  reorderInfoWindowTabs: (
    draggedTabId: InfoWindowTabId,
    targetTabId: InfoWindowTabId,
    placement: "before" | "after",
  ) => void;
  setInfoWindowActiveTab: (windowId: InfoWindowTabId) => void;
  splitInfoWindowTab: (
    tabId: InfoWindowTabId,
    point: Parameters<
      NonNullable<ComponentProps<typeof InfoTabbedWindow>["onTabDragOut"]>
    >[1],
  ) => void;
  updateControlDockTarget: (rect: WindowRect) => void;
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
  combineDropTarget,
  completeInfoGroupDrag,
  completeInfoWindowDrag,
  dockInfoWindowTabs,
  dockedInfoTabIds,
  groupedInfoWindowIds,
  infoWindowActiveTab,
  infoWindowMinimized,
  onPreviewActionLogCard,
  onRequestRollback,
  previewCard,
  previewMinimized,
  reorderInfoWindowTabs,
  setInfoWindowActiveTab,
  showActionLogWindow,
  showSettingsWindow,
  showTabbedInfoWindow,
  splitInfoWindowTab,
  standaloneInfoWindowIds,
  updateControlDockTarget,
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
          dockInfoWindowTabs(groupedInfoWindowIds);
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
          dockInfoWindowTabs(["log"]);
        }}
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
          dockInfoWindowTabs(["preview"]);
        }}
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
        minimized={false}
        zIndex={activeFloatingWindowZIndexes[settingsWindowKey]}
        onToggleMinimized={() => {
          dockInfoWindowTabs(["settings"]);
        }}
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
