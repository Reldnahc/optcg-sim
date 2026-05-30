import type { ActionLogCardMention, ActionLogEntry } from "../action-log.js";
import type { ClientCardModel } from "../view-model.js";
import { ActionLogContent } from "./ActionLogWindow.js";
import { CardPreviewContent } from "./CardPreviewWindow.js";
import { SettingsContent } from "./SettingsWindow.js";
import { TabbedFloatingWindow } from "./TabbedFloatingWindow.js";
import type {
  FloatingWindowTab,
  TabDragOutPoint,
} from "./TabbedFloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";

export type InfoWindowTabId = "preview" | "log" | "settings";

export interface InfoTabbedWindowProps {
  previewCard?: ClientCardModel | undefined;
  entries: readonly ActionLogEntry[];
  logOpen: boolean;
  settingsOpen: boolean;
  tabIds: readonly InfoWindowTabId[];
  className?: string | undefined;
  activeTabId: InfoWindowTabId;
  minimized: boolean;
  initialRect?: WindowRect | undefined;
  onActiveTabChange: (tabId: InfoWindowTabId) => void;
  onToggleMinimized: () => void;
  onCloseActiveTab: (tabId: InfoWindowTabId) => void;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onTabDragOut?:
    | ((tabId: InfoWindowTabId, point: TabDragOutPoint) => void)
    | undefined;
  onRequestRollback?: (rollbackPointId: string) => void;
  onPreviewCard?: (card: ActionLogCardMention["card"]) => void;
}

const isInfoWindowTabId = (tabId: string): tabId is InfoWindowTabId =>
  tabId === "preview" || tabId === "log" || tabId === "settings";

export const InfoTabbedWindow = ({
  previewCard,
  entries,
  logOpen,
  settingsOpen,
  tabIds,
  className,
  activeTabId,
  minimized,
  initialRect,
  onActiveTabChange,
  onToggleMinimized,
  onCloseActiveTab,
  onRectChange,
  onTabDragOut,
  onRequestRollback,
  onPreviewCard,
}: InfoTabbedWindowProps): React.JSX.Element | null => {
  const tabIdSet = new Set(tabIds);
  const tabs: FloatingWindowTab[] = [];
  if (tabIdSet.has("preview") && previewCard !== undefined) {
    tabs.push({
      id: "preview",
      title: "Preview",
      content: <CardPreviewContent card={previewCard} />,
    });
  }
  if (tabIdSet.has("log") && logOpen) {
    tabs.push({
      id: "log",
      title: "Log",
      content: (
        <ActionLogContent
          entries={entries}
          onRequestRollback={onRequestRollback}
          onPreviewCard={onPreviewCard}
        />
      ),
    });
  }
  if (tabIdSet.has("settings") && settingsOpen) {
    tabs.push({
      id: "settings",
      title: "Settings",
      content: <SettingsContent />,
    });
  }

  const activeTab = tabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : tabs[0]?.id;
  if (activeTab === undefined || !isInfoWindowTabId(activeTab)) {
    return null;
  }

  return (
    <TabbedFloatingWindow
      tabs={tabs}
      activeTabId={activeTab}
      className={["info-tabbed-window", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      initialRect={initialRect}
      minWidth={260}
      minHeight={180}
      minimized={minimized}
      onActiveTabChange={(tabId) => {
        if (isInfoWindowTabId(tabId)) {
          onActiveTabChange(tabId);
        }
      }}
      onToggleMinimized={onToggleMinimized}
      onClose={() => {
        onCloseActiveTab(activeTab);
      }}
      onRectChange={onRectChange}
      onTabDragOut={(tabId, point) => {
        if (isInfoWindowTabId(tabId)) {
          onTabDragOut?.(tabId, point);
        }
      }}
    />
  );
};
