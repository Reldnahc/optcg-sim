import { useRef, type CSSProperties, type ReactNode } from "react";

import type { ClientActionModel } from "../view-model.js";
import { ActionMenu } from "./ActionMenu.js";
import type { TabDragOutPoint } from "./TabbedFloatingWindow.js";

export interface ControlDockTab {
  id: string;
  title: string;
  content: ReactNode;
}

export interface ControlRailProps {
  errors: readonly string[];
  globalActions: readonly ClientActionModel[];
  disabled: boolean;
  width?: number | undefined;
  dockHeight?: number | undefined;
  dockActive?: boolean | undefined;
  dockTabs?: readonly ControlDockTab[] | undefined;
  activeDockTabId?: string | undefined;
  onAction: (actionIndex: number) => void;
  onNewMatch: () => void;
  onResizePointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDockResizePointerDown?:
    | ((event: React.PointerEvent<HTMLButtonElement>) => void)
    | undefined;
  onDockTabChange?: ((tabId: string) => void) | undefined;
  onDockTabClose?: ((tabId: string) => void) | undefined;
  onDockTabDragOut?:
    | ((tabId: string, point: TabDragOutPoint) => void)
    | undefined;
  onDockGroupDragOut?: ((point: TabDragOutPoint) => void) | undefined;
  rollbackStatus?:
    | {
        message: string;
        canCancel: boolean;
      }
    | undefined;
  onCancelRollback?: (() => void) | undefined;
  concedeDisabled?: boolean | undefined;
  concedeConfirming?: boolean | undefined;
  onConcede?: (() => void) | undefined;
  onSettingsOpen?: (() => void) | undefined;
  previewControl?: ReactNode | undefined;
  actionLogControl?: ReactNode | undefined;
}

export const ControlRail = ({
  errors,
  globalActions,
  disabled,
  width,
  dockHeight,
  dockActive = false,
  dockTabs = [],
  activeDockTabId,
  onAction,
  onNewMatch,
  onResizePointerDown,
  onDockResizePointerDown,
  onDockTabChange,
  onDockTabClose,
  onDockTabDragOut,
  onDockGroupDragOut,
  rollbackStatus,
  onCancelRollback,
  concedeDisabled = true,
  concedeConfirming = false,
  onConcede,
  onSettingsOpen,
  previewControl,
  actionLogControl,
}: ControlRailProps): React.JSX.Element => {
  const tabDragStart = useRef<
    | {
        tabId: string;
        pointerId: number;
        clientX: number;
        clientY: number;
      }
    | undefined
  >(undefined);
  const groupDragStart = useRef<
    | {
        pointerId: number;
        clientX: number;
        clientY: number;
      }
    | undefined
  >(undefined);
  const suppressTabClick = useRef(false);
  const concedeLabel = concedeConfirming ? "Confirm concede" : "Concede";
  const activeDockTab =
    dockTabs.find((tab) => tab.id === activeDockTabId) ?? dockTabs[0];
  const hasDockedWindow = activeDockTab !== undefined;
  const tabDragOutDistance = 32;
  const controlsPanelStyle:
    | (CSSProperties & { "--control-window-dock-height"?: string })
    | undefined =
    dockHeight === undefined
      ? undefined
      : { "--control-window-dock-height": `${String(dockHeight)}px` };

  return (
    <aside
      className={["control-rail", dockActive ? "is-dock-active" : ""]
        .filter(Boolean)
        .join(" ")}
      style={width === undefined ? undefined : { width: `${String(width)}px` }}
    >
      <button
        className="control-rail-resize-handle"
        type="button"
        aria-label="Resize controls"
        title="Resize controls"
        onPointerDown={onResizePointerDown}
      />
      <section className="summary-panel opponent-summary">
        <h2>Opponent</h2>
      </section>
      <section className="controls-panel" style={controlsPanelStyle}>
        <div className="control-tool-strip">
          {previewControl === undefined ? null : (
            <div className="control-preview-slot">{previewControl}</div>
          )}
          {actionLogControl === undefined ? null : (
            <div className="control-action-log-slot">{actionLogControl}</div>
          )}
          <button
            className="control-icon-button settings-button"
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={onSettingsOpen}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10.1 2.8h3.8l.4 2.3a7.2 7.2 0 0 1 1.3.6l2-1.3 2.7 2.7-1.3 2a7.2 7.2 0 0 1 .6 1.3l2.3.4v3.8l-2.3.4a7.2 7.2 0 0 1-.6 1.3l1.3 2-2.7 2.7-2-1.3a7.2 7.2 0 0 1-1.3.6l-.4 2.3h-3.8l-.4-2.3a7.2 7.2 0 0 1-1.3-.6l-2 1.3-2.7-2.7 1.3-2a7.2 7.2 0 0 1-.6-1.3l-2.3-.4v-3.8l2.3-.4A7.2 7.2 0 0 1 5 9.1l-1.3-2 2.7-2.7 2 1.3a7.2 7.2 0 0 1 1.3-.6Z" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </button>
          <button
            className={`control-icon-button concede-button ${
              concedeConfirming ? "is-confirming" : ""
            }`}
            type="button"
            disabled={concedeDisabled}
            aria-label={concedeLabel}
            title={concedeLabel}
            onClick={onConcede}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 3v18" />
              <path d="M5 4h12l-2 4 2 4H5" />
            </svg>
          </button>
          <button
            className="control-icon-button new-match-button"
            type="button"
            aria-label="New match"
            title="New match"
            onClick={onNewMatch}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
        {errors.map((error) => (
          <p key={error} className="error-text">
            {error}
          </p>
        ))}
        {rollbackStatus === undefined ? null : (
          <section className="rollback-status-panel">
            <p>{rollbackStatus.message}</p>
            {rollbackStatus.canCancel ? (
              <button
                className="action-button"
                type="button"
                disabled={disabled}
                onClick={onCancelRollback}
              >
                Cancel rollback request
              </button>
            ) : null}
          </section>
        )}
        <ActionMenu
          title="Global actions"
          actions={globalActions}
          disabled={disabled}
          onAction={onAction}
        />
        <div
          className={[
            "control-window-dock",
            hasDockedWindow ? "has-docked-window" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Window dock"
        >
          <button
            className="control-window-dock-resize-handle"
            type="button"
            aria-label="Resize dock"
            title="Resize dock"
            onPointerDown={onDockResizePointerDown}
          />
          {activeDockTab === undefined ? (
            <span>Drop windows here</span>
          ) : (
            <section className="control-dock-window">
              <div className="control-dock-window-tabs" role="tablist">
                {onDockGroupDragOut === undefined ? null : (
                  <button
                    className="control-dock-window-grab-nub"
                    type="button"
                    aria-label="Pop out docked window group"
                    title="Pop out docked window group"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      groupDragStart.current = {
                        pointerId: event.pointerId,
                        clientX: event.clientX,
                        clientY: event.clientY,
                      };
                    }}
                    onPointerMove={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const start = groupDragStart.current;
                      if (
                        start === undefined ||
                        start.pointerId !== event.pointerId
                      ) {
                        return;
                      }
                      const distance =
                        Math.abs(event.clientX - start.clientX) +
                        Math.abs(event.clientY - start.clientY);
                      if (distance < tabDragOutDistance) {
                        return;
                      }
                      groupDragStart.current = undefined;
                      if (
                        event.currentTarget.hasPointerCapture(event.pointerId)
                      ) {
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                      }
                      onDockGroupDragOut({
                        x: event.clientX,
                        y: event.clientY,
                        pointerId: event.pointerId,
                      });
                    }}
                    onPointerUp={(event) => {
                      event.stopPropagation();
                      if (
                        groupDragStart.current?.pointerId === event.pointerId
                      ) {
                        groupDragStart.current = undefined;
                      }
                    }}
                    onPointerCancel={(event) => {
                      event.stopPropagation();
                      if (
                        groupDragStart.current?.pointerId === event.pointerId
                      ) {
                        groupDragStart.current = undefined;
                      }
                    }}
                  />
                )}
                {dockTabs.map((tab) => {
                  const selected = tab.id === activeDockTab.id;
                  return (
                    <button
                      key={tab.id}
                      className={[
                        "control-dock-window-tab",
                        selected ? "is-active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onPointerDown={(event) => {
                        event.preventDefault();
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
                        const distance =
                          Math.abs(event.clientX - start.clientX) +
                          Math.abs(event.clientY - start.clientY);
                        if (distance < tabDragOutDistance) {
                          return;
                        }
                        tabDragStart.current = undefined;
                        suppressTabClick.current = true;
                        if (
                          event.currentTarget.hasPointerCapture(event.pointerId)
                        ) {
                          event.currentTarget.releasePointerCapture(
                            event.pointerId,
                          );
                        }
                        onDockTabDragOut?.(tab.id, {
                          x: event.clientX,
                          y: event.clientY,
                          pointerId: event.pointerId,
                        });
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
                        const distance =
                          Math.abs(event.clientX - start.clientX) +
                          Math.abs(event.clientY - start.clientY);
                        if (distance >= tabDragOutDistance) {
                          suppressTabClick.current = true;
                          return;
                        }
                        onDockTabChange?.(tab.id);
                      }}
                      onPointerCancel={(event) => {
                        event.stopPropagation();
                        if (
                          tabDragStart.current?.pointerId === event.pointerId
                        ) {
                          tabDragStart.current = undefined;
                        }
                      }}
                      onClick={() => {
                        if (suppressTabClick.current) {
                          suppressTabClick.current = false;
                          return;
                        }
                        onDockTabChange?.(tab.id);
                      }}
                    >
                      {tab.title}
                    </button>
                  );
                })}
                <button
                  className="control-dock-window-close"
                  type="button"
                  aria-label={`Close ${activeDockTab.title}`}
                  title={`Close ${activeDockTab.title}`}
                  onClick={() => {
                    onDockTabClose?.(activeDockTab.id);
                  }}
                >
                  x
                </button>
              </div>
              <div className="control-dock-window-body">
                {activeDockTab.content}
              </div>
            </section>
          )}
        </div>
      </section>
      <section className="summary-panel player-summary">
        <h2>Player</h2>
      </section>
    </aside>
  );
};
