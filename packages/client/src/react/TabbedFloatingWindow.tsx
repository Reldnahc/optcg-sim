import type { ReactNode } from "react";

import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";

export interface FloatingWindowTab {
  id: string;
  title: string;
  content: ReactNode;
}

export interface TabbedFloatingWindowProps {
  tabs: readonly FloatingWindowTab[];
  activeTabId: string;
  className?: string | undefined;
  initialRect?: WindowRect | undefined;
  minWidth?: number | undefined;
  minHeight?: number | undefined;
  minimized: boolean;
  onActiveTabChange: (tabId: string) => void;
  onToggleMinimized: () => void;
  onClose: () => void;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
}

export const TabbedFloatingWindow = ({
  tabs,
  activeTabId,
  className,
  initialRect,
  minWidth = 260,
  minHeight = 180,
  minimized,
  onActiveTabChange,
  onToggleMinimized,
  onClose,
  onRectChange,
}: TabbedFloatingWindowProps): React.JSX.Element | null => {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  if (activeTab === undefined) {
    return null;
  }

  return (
    <FloatingWindow
      title={activeTab.title}
      className={["tabbed-floating-window", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      initialRect={initialRect}
      minWidth={minWidth}
      minHeight={minHeight}
      minimized={minimized}
      onToggleMinimized={onToggleMinimized}
      onClose={onClose}
      onRectChange={onRectChange}
    >
      <div className="floating-window-tab-strip" role="tablist" aria-label="Window tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={[
              "floating-window-tab",
              tab.id === activeTab.id ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab.id}
            onClick={() => {
              onActiveTabChange(tab.id);
            }}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div className="floating-window-tab-panel" role="tabpanel">
        {activeTab.content}
      </div>
    </FloatingWindow>
  );
};
