import { useRef, type ReactNode } from "react";

import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";
import type { WindowPoint } from "./floating-window-grouping.js";

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
  onTabDragOut?: ((tabId: string, point: WindowPoint) => void) | undefined;
}

interface TabDragStart {
  tabId: string;
  pointerId: number;
  clientX: number;
  clientY: number;
}

const tabDragOutDistance = 32;

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
  onTabDragOut,
}: TabbedFloatingWindowProps): React.JSX.Element | null => {
  const tabDragStart = useRef<TabDragStart | undefined>(undefined);
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
      <div
        className="floating-window-tab-strip"
        role="tablist"
        aria-label="Window tabs"
      >
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
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              tabDragStart.current = {
                tabId: tab.id,
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
              };
            }}
            onPointerUp={(event) => {
              const start = tabDragStart.current;
              tabDragStart.current = undefined;
              if (
                start === undefined ||
                start.pointerId !== event.pointerId ||
                start.tabId !== tab.id
              ) {
                return;
              }
              const distance =
                Math.abs(event.clientX - start.clientX) +
                Math.abs(event.clientY - start.clientY);
              if (distance >= tabDragOutDistance) {
                onTabDragOut?.(tab.id, {
                  x: event.clientX,
                  y: event.clientY,
                });
                return;
              }
              onActiveTabChange(tab.id);
            }}
            onPointerCancel={(event) => {
              if (tabDragStart.current?.pointerId === event.pointerId) {
                tabDragStart.current = undefined;
              }
            }}
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
