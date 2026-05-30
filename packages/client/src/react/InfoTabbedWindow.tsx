import type { ActionLogCardMention, ActionLogEntry } from "../action-log.js";
import type { ClientCardModel } from "../view-model.js";
import { ActionLogContent } from "./ActionLogWindow.js";
import { CardPreviewContent } from "./CardPreviewWindow.js";
import { TabbedFloatingWindow } from "./TabbedFloatingWindow.js";
import type { FloatingWindowTab } from "./TabbedFloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";
import type { WindowPoint } from "./floating-window-grouping.js";

export type InfoWindowTabId = "preview" | "log";

export interface InfoTabbedWindowProps {
  previewCard?: ClientCardModel | undefined;
  entries: readonly ActionLogEntry[];
  activeTabId: InfoWindowTabId;
  minimized: boolean;
  initialRect?: WindowRect | undefined;
  onActiveTabChange: (tabId: InfoWindowTabId) => void;
  onToggleMinimized: () => void;
  onCloseActiveTab: (tabId: InfoWindowTabId) => void;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onTabDragOut?: ((tabId: InfoWindowTabId, point: WindowPoint) => void) | undefined;
  onRequestRollback?: (rollbackPointId: string) => void;
  onPreviewCard?: (card: ActionLogCardMention["card"]) => void;
}

const isInfoWindowTabId = (tabId: string): tabId is InfoWindowTabId =>
  tabId === "preview" || tabId === "log";

export const InfoTabbedWindow = ({
  previewCard,
  entries,
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
  const tabs: FloatingWindowTab[] = [];
  if (previewCard !== undefined) {
    tabs.push({
      id: "preview",
      title: "Preview",
      content: <CardPreviewContent card={previewCard} />,
    });
  }
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

  const activeTab = tabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : "log";

  return (
    <TabbedFloatingWindow
      tabs={tabs}
      activeTabId={activeTab}
      className="info-tabbed-window"
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
