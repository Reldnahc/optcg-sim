import { useRef, type ReactNode } from "react";

import type { PublicTurnState } from "@optcg/types";
import type { ClientActionModel } from "../view-model.js";
import { ActionMenu } from "./ActionMenu.js";
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
  renderContent: () => ReactNode;
}

export interface ControlRailProps {
  errors: readonly string[];
  globalActions: readonly ClientActionModel[];
  disabled: boolean;
  opponentConnectionStatus?: "connected" | "disconnected" | undefined;
  turnState?: PublicTurnState | undefined;
  matchStatus?: string | undefined;
  rematchStatus?: "requestedBySelf" | "requestedByOpponent" | undefined;
  width?: number | undefined;
  dockActive?: boolean | undefined;
  dockTabs?: readonly ControlDockTab[] | undefined;
  activeDockTabId?: string | undefined;
  onAction: (actionIndex: number) => void;
  onHome: () => void;
  onRematch?: (() => Promise<void> | void) | undefined;
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
}

export const ControlRail = ({
  errors,
  globalActions,
  disabled,
  opponentConnectionStatus,
  turnState,
  matchStatus,
  rematchStatus,
  width,
  dockActive = false,
  dockTabs = [],
  activeDockTabId,
  onAction,
  onHome,
  onRematch,
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
  const matchIsOver = matchStatus === "completed" || matchStatus === "gameOver";
  const opponentLeft = opponentConnectionStatus === "disconnected";
  const rematchLabel = opponentLeft
    ? "Opponent left"
    : rematchStatus === undefined
      ? "Rematch"
      : "Rematch requested";
  const rematchDisabled =
    disabled ||
    onRematch === undefined ||
    opponentLeft ||
    rematchStatus === "requestedBySelf";
  const activeDockTab =
    dockTabs.find((tab) => tab.id === activeDockTabId) ?? dockTabs[0];
  const hasDockedWindow = activeDockTab !== undefined;
  const tabDragOutDistance = 32;

  return (
    <aside
      className={["control-rail", dockActive ? "is-dock-active" : ""]
        .filter(Boolean)
        .join(" ")}
      style={width === undefined ? undefined : { width: `${String(width)}px` }}
    >
      <section className="controls-panel">
        <div
          className={[
            "control-window-dock",
            hasDockedWindow ? "has-docked-window" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Window dock"
        >
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
                {activeDockTab.renderContent()}
              </div>
            </section>
          )}
        </div>
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
        </div>
        <div className="control-action-stack">
          {turnState === undefined ? null : (
            <div className="control-turn-status" aria-label="Current turn">
              <span className="control-turn-number">
                Turn {turnState.globalTurn}
              </span>
              <span className="control-turn-phase">
                {turnStatusLabel(turnState)}
              </span>
            </div>
          )}
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
            actions={globalActions}
            disabled={disabled}
            onAction={onAction}
          />
          {matchIsOver ? (
            <div className="end-match-actions" aria-label="Match ended actions">
              <button
                className="action-button is-primary end-match-action"
                type="button"
                disabled={rematchDisabled}
                aria-label={rematchLabel}
                onClick={() => {
                  void onRematch?.();
                }}
              >
                {rematchLabel}
              </button>
              <button
                className="action-button end-match-action"
                type="button"
                disabled={disabled}
                aria-label="Home"
                onClick={onHome}
              >
                Home
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </aside>
  );
};

const phaseLabels: Record<PublicTurnState["phase"], string> = {
  refresh: "Refresh Phase",
  draw: "Draw Phase",
  don: "DON!! Phase",
  main: "Main Phase",
  end: "End Phase",
};

const stepLabels: Record<NonNullable<PublicTurnState["step"]>, string> = {
  attack: "Attack Step",
  block: "Block Step",
  counter: "Counter Step",
  damage: "Damage Step",
  end: "End Step",
};

const turnStatusLabel = (turnState: PublicTurnState): string =>
  turnState.step === undefined
    ? phaseLabels[turnState.phase]
    : stepLabels[turnState.step];
