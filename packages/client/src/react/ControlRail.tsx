import { useRef, type CSSProperties, type ReactNode } from "react";

import type { AccountLoadout } from "../account-client.js";
import type { LobbyClientState } from "../controller.js";
import type {
  ClientActionModel,
  PlayerSummaryTimerModel,
} from "../view-model.js";
import { ActionMenu } from "./ActionMenu.js";
import { LobbyDeckPanel } from "./LobbyDeckPanel.js";
import type { TabDragOutPoint } from "./TabbedFloatingWindow.js";
import type { ReorderPlacement } from "./drag-reorder.js";
import {
  tabDragIntentFromPoint,
  tabDragRectFromElement,
  tabReorderEntriesFromTabList,
  tabReorderTargetFromPointer,
} from "./tab-drag.js";

export interface ControlDockTab {
  id: string;
  title: string;
  content: ReactNode;
}

export interface ControlRailProps {
  errors: readonly string[];
  globalActions: readonly ClientActionModel[];
  disabled: boolean;
  selfLabel?: string | undefined;
  opponentLabel?: string | undefined;
  selfTimer?: PlayerSummaryTimerModel | undefined;
  opponentTimer?: PlayerSummaryTimerModel | undefined;
  selfIsTurnPlayer?: boolean | undefined;
  opponentIsTurnPlayer?: boolean | undefined;
  selfConnectionStatus?: "connected" | "disconnected" | undefined;
  opponentConnectionStatus?: "connected" | "disconnected" | undefined;
  matchStatus?: string | undefined;
  width?: number | undefined;
  dockHeight?: number | undefined;
  dockActive?: boolean | undefined;
  dockTabs?: readonly ControlDockTab[] | undefined;
  activeDockTabId?: string | undefined;
  onAction: (actionIndex: number) => void;
  onNewMatch: () => void;
  onRematch?: (() => Promise<void> | void) | undefined;
  onResizePointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDockResizePointerDown?:
    | ((event: React.PointerEvent<HTMLButtonElement>) => void)
    | undefined;
  onDockTabChange?: ((tabId: string) => void) | undefined;
  onDockTabClose?: ((tabId: string) => void) | undefined;
  onDockTabDragOut?:
    | ((tabId: string, point: TabDragOutPoint) => void)
    | undefined;
  onDockTabReorder?:
    | ((
        draggedTabId: string,
        targetTabId: string,
        placement: ReorderPlacement,
      ) => void)
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
  previewControl?: ReactNode | undefined;
  actionLogControl?: ReactNode | undefined;
  settingsControl?: ReactNode | undefined;
  lobbyDeckState?: LobbyClientState | undefined;
  accountLoadouts?: readonly AccountLoadout[] | undefined;
  accountLoadoutsStatus?: "idle" | "loading" | "ready" | "error" | undefined;
  accountLoadoutsError?: string | undefined;
  deckSubmissionDisabled?: boolean | undefined;
  onSubmitLoadout?: ((loadoutId: string) => Promise<void>) | undefined;
}

export const ControlRail = ({
  errors,
  globalActions,
  disabled,
  selfLabel = "Player",
  opponentLabel = "Opponent",
  selfTimer,
  opponentTimer,
  selfIsTurnPlayer = false,
  opponentIsTurnPlayer = false,
  selfConnectionStatus,
  opponentConnectionStatus,
  matchStatus,
  width,
  dockHeight,
  dockActive = false,
  dockTabs = [],
  activeDockTabId,
  onAction,
  onNewMatch,
  onRematch,
  onResizePointerDown,
  onDockResizePointerDown,
  onDockTabChange,
  onDockTabClose,
  onDockTabDragOut,
  onDockTabReorder,
  onDockGroupDragOut,
  rollbackStatus,
  onCancelRollback,
  concedeDisabled = true,
  concedeConfirming = false,
  onConcede,
  previewControl,
  actionLogControl,
  settingsControl,
  lobbyDeckState,
  accountLoadouts = [],
  accountLoadoutsStatus = "idle",
  accountLoadoutsError,
  deckSubmissionDisabled = false,
  onSubmitLoadout,
}: ControlRailProps): React.JSX.Element => {
  const tabDragStart = useRef<
    | {
        tabId: string;
        pointerId: number;
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
  const rematchDisabled =
    disabled || (matchStatus !== "completed" && matchStatus !== "gameOver");
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
      <section
        className={[
          "summary-panel",
          "opponent-summary",
          opponentIsTurnPlayer ? "is-turn-player" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <PlayerSummaryLabel
          label={opponentLabel}
          status={opponentConnectionStatus}
          timer={opponentTimer}
        />
      </section>
      <section className="controls-panel" style={controlsPanelStyle}>
        <div className="control-tool-strip">
          {previewControl === undefined ? null : (
            <div className="control-preview-slot">{previewControl}</div>
          )}
          {actionLogControl === undefined ? null : (
            <div className="control-action-log-slot">{actionLogControl}</div>
          )}
          {settingsControl === undefined ? null : (
            <div className="control-settings-slot">{settingsControl}</div>
          )}
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
            disabled={rematchDisabled}
            aria-label="Rematch"
            title="Rematch"
            onClick={() => {
              void onRematch?.();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17 2v5h-5" />
              <path d="M7 22v-5h5" />
              <path d="M18.5 9A7 7 0 0 0 7.4 5.2L4 8.5" />
              <path d="M5.5 15A7 7 0 0 0 16.6 18.8L20 15.5" />
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
        {lobbyDeckState === undefined ||
        onSubmitLoadout === undefined ? null : (
          <div className="control-session-content">
            <LobbyDeckPanel
              disabled={deckSubmissionDisabled}
              lobbyState={lobbyDeckState}
              loadouts={accountLoadouts}
              loadoutsStatus={accountLoadoutsStatus}
              loadoutsError={accountLoadoutsError}
              onSubmitLoadout={onSubmitLoadout}
            />
          </div>
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
                      data-tab-id={tab.id}
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
                          ".control-dock-window-tabs",
                        );
                        if (tabStripElement === null) {
                          return;
                        }
                        const tabStripRect =
                          tabDragRectFromElement(tabStripElement);
                        const intent = tabDragIntentFromPoint({
                          point: { x: event.clientX, y: event.clientY },
                          tabStripRect,
                        });
                        if (intent === "dragOut") {
                          tabDragStart.current = undefined;
                          suppressTabClick.current = true;
                          if (
                            event.currentTarget.hasPointerCapture(
                              event.pointerId,
                            )
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
                          return;
                        }
                        const reorderTarget = tabReorderTargetFromPointer({
                          entries:
                            tabReorderEntriesFromTabList(tabStripElement),
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
                        onDockTabReorder?.(
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
      <section
        className={[
          "summary-panel",
          "player-summary",
          selfIsTurnPlayer ? "is-turn-player" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <PlayerSummaryLabel
          label={selfLabel}
          status={selfConnectionStatus}
          timer={selfTimer}
        />
      </section>
    </aside>
  );
};

const PlayerSummaryLabel = ({
  label,
  status,
  timer,
}: {
  label: string;
  status?: "connected" | "disconnected" | undefined;
  timer?: PlayerSummaryTimerModel | undefined;
}): React.JSX.Element => (
  <div className="player-summary-label">
    <h2>
      <span className="player-name">{label}</span>
      {status === undefined ? null : (
        <span
          className={`connection-status is-${status}`}
          aria-label={`${label} ${status}`}
          title={status === "connected" ? "Connected" : "Disconnected"}
        />
      )}
    </h2>
    {timer === undefined ? null : (
      <div className="player-timers" aria-label={`${label} timers`}>
        <span
          className={["game-timer", timer.isRunning ? "is-running" : ""]
            .filter(Boolean)
            .join(" ")}
          title="Game timer"
        >
          {timer.game}
        </span>
        {timer.disconnect === undefined ? null : (
          <span className="disconnect-timer" title="Reconnect timer">
            {timer.disconnect}
          </span>
        )}
      </div>
    )}
  </div>
);
