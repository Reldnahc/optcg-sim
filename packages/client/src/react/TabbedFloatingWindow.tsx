import { useRef, useState, type ReactNode } from "react";

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
  draggingTabId?: string | undefined;
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
  draggingTabId,
  onActiveTabChange,
  onToggleMinimized,
  onClose,
  onRectChange,
  onTabDragOut,
}: TabbedFloatingWindowProps): React.JSX.Element | null => {
  const tabDragStart = useRef<TabDragStart | undefined>(undefined);
  const suppressTabClick = useRef(false);
  const [internalDraggingTabId, setInternalDraggingTabId] = useState<
    string | undefined
  >(undefined);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  if (activeTab === undefined) {
    return null;
  }
  const feedbackDraggingTabId = draggingTabId ?? internalDraggingTabId;

  return (
    <FloatingWindow
      title={activeTab.title}
      className={[
        "tabbed-floating-window",
        feedbackDraggingTabId === undefined ? "" : "is-tab-tearing-out",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      initialRect={initialRect}
      minWidth={minWidth}
      minHeight={minHeight}
      minimized={minimized}
      onToggleMinimized={onToggleMinimized}
      onClose={onClose}
      onRectChange={onRectChange}
      headerContent={
        <div
          className="floating-window-header-tabs"
          role="tablist"
          aria-label="Window tabs"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={[
                "floating-window-tab",
                tab.id === activeTab.id ? "is-active" : "",
                tab.id === feedbackDraggingTabId ? "is-tab-dragging" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              role="tab"
              aria-selected={tab.id === activeTab.id}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                suppressTabClick.current = false;
                tabDragStart.current = {
                  tabId: tab.id,
                  pointerId: event.pointerId,
                  clientX: event.clientX,
                  clientY: event.clientY,
                };
              }}
              onPointerMove={(event) => {
                event.stopPropagation();
                const start = tabDragStart.current;
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
                  setInternalDraggingTabId(tab.id);
                }
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                const start = tabDragStart.current;
                tabDragStart.current = undefined;
                setInternalDraggingTabId(undefined);
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
                  suppressTabClick.current = true;
                  onTabDragOut?.(tab.id, {
                    x: event.clientX,
                    y: event.clientY,
                  });
                  return;
                }
                onActiveTabChange(tab.id);
              }}
              onPointerCancel={(event) => {
                event.stopPropagation();
                if (tabDragStart.current?.pointerId === event.pointerId) {
                  tabDragStart.current = undefined;
                }
                setInternalDraggingTabId(undefined);
              }}
              onClick={() => {
                if (suppressTabClick.current) {
                  suppressTabClick.current = false;
                  return;
                }
                onActiveTabChange(tab.id);
              }}
            >
              {tab.title}
            </button>
          ))}
        </div>
      }
    >
      <div className="floating-window-tab-panel" role="tabpanel">
        {activeTab.content}
      </div>
    </FloatingWindow>
  );
};
