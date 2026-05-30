import { useRef, type ReactNode } from "react";

import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";
import type { ReorderPlacement } from "./drag-reorder.js";
import type { WindowPoint } from "./floating-window-grouping.js";
import {
  tabDragIntentFromPoint,
  tabDragRectFromElement,
  tabReorderEntriesFromTabList,
  tabReorderTargetFromPointer,
} from "./tab-drag.js";

export interface TabDragOutPoint extends WindowPoint {
  pointerId: number;
}

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
  docked?: boolean | undefined;
  minimized: boolean;
  onActiveTabChange: (tabId: string) => void;
  onToggleMinimized: () => void;
  onClose: () => void;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onDragMove?: ((rect: WindowRect) => void) | undefined;
  onDragEnd?: ((rect: WindowRect) => WindowRect | undefined) | undefined;
  onTabReorder?:
    | ((
        draggedTabId: string,
        targetTabId: string,
        placement: ReorderPlacement,
      ) => void)
    | undefined;
  onTabDragOut?: ((tabId: string, point: TabDragOutPoint) => void) | undefined;
}

interface TabDragStart {
  tabId: string;
  pointerId: number;
}

const releaseTabPointerCapture = (
  element: HTMLElement,
  pointerId: number,
): void => {
  if (element.hasPointerCapture(pointerId)) {
    element.releasePointerCapture(pointerId);
  }
};

export const TabbedFloatingWindow = ({
  tabs,
  activeTabId,
  className,
  initialRect,
  minWidth = 260,
  minHeight = 180,
  docked = false,
  minimized,
  onActiveTabChange,
  onToggleMinimized,
  onClose,
  onRectChange,
  onDragMove,
  onDragEnd,
  onTabReorder,
  onTabDragOut,
}: TabbedFloatingWindowProps): React.JSX.Element | null => {
  const tabDragStart = useRef<TabDragStart | undefined>(undefined);
  const suppressTabClick = useRef(false);
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
      docked={docked}
      minimized={minimized}
      onToggleMinimized={onToggleMinimized}
      onClose={onClose}
      onRectChange={onRectChange}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      headerContent={
        <div
          className="floating-window-header-tabs"
          role="tablist"
          aria-label="Window tabs"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-tab-id={tab.id}
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
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                suppressTabClick.current = false;
                tabDragStart.current = {
                  tabId: tab.id,
                  pointerId: event.pointerId,
                };
              }}
              onPointerMove={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const start = tabDragStart.current;
                if (
                  start === undefined ||
                  start.pointerId !== event.pointerId ||
                  start.tabId !== tab.id
                ) {
                  return;
                }
                const tabStripElement = event.currentTarget.closest(
                  ".floating-window-header-tabs",
                );
                if (tabStripElement === null) {
                  return;
                }
                const tabStripRect = tabDragRectFromElement(tabStripElement);
                const intent = tabDragIntentFromPoint({
                  point: { x: event.clientX, y: event.clientY },
                  tabStripRect,
                });
                if (intent === "dragOut") {
                  tabDragStart.current = undefined;
                  suppressTabClick.current = true;
                  releaseTabPointerCapture(
                    event.currentTarget,
                    event.pointerId,
                  );
                  onTabDragOut?.(tab.id, {
                    x: event.clientX,
                    y: event.clientY,
                    pointerId: event.pointerId,
                  });
                  return;
                }
                const reorderTarget = tabReorderTargetFromPointer({
                  entries: tabReorderEntriesFromTabList(tabStripElement),
                  draggedId: start.tabId,
                  clientX: event.clientX,
                });
                if (
                  reorderTarget === undefined ||
                  reorderTarget.targetId === start.tabId
                ) {
                  return;
                }
                suppressTabClick.current = true;
                onTabReorder?.(
                  start.tabId,
                  reorderTarget.targetId,
                  reorderTarget.placement,
                );
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                const start = tabDragStart.current;
                tabDragStart.current = undefined;
                if (
                  start === undefined ||
                  start.pointerId !== event.pointerId ||
                  start.tabId !== tab.id
                ) {
                  return;
                }
                if (suppressTabClick.current) {
                  return;
                }
                onActiveTabChange(tab.id);
              }}
              onPointerCancel={(event) => {
                event.stopPropagation();
                if (tabDragStart.current?.pointerId === event.pointerId) {
                  tabDragStart.current = undefined;
                }
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
