import { useEffect, useMemo, useState } from "react";
import { createActionLogEntries } from "../action-log.js";
import type { ClientCardModel } from "../view-model.js";
import { ActionLogToggle } from "./ActionLogToggle.js";
import {
  ActionLogWindow,
  defaultActionLogWindowRect,
} from "./ActionLogWindow.js";
import { BoardLayout } from "./BoardLayout.js";
import {
  actionLogCardModel,
  cardDisplayFromCatalog,
  cardModelFromCatalog,
} from "./card-model.js";
import { CardPreviewToggle } from "./CardPreviewToggle.js";
import {
  CardPreviewWindow,
  defaultCardPreviewWindowRect,
} from "./CardPreviewWindow.js";
import { CollectionModalHost } from "./CollectionModalHost.js";
import { ControlRail } from "./ControlRail.js";
import { DecisionModalHost } from "./DecisionModalHost.js";
import type { WindowRect } from "./FloatingWindow.js";
import { MatchLoadingPanel } from "./MatchLoadingPanel.js";
import { moveIdNear, type ReorderPlacement } from "./drag-reorder.js";
import { InfoTabbedWindow } from "./InfoTabbedWindow.js";
import {
  actionLogWindowKey,
  cardPreviewWindowKey,
  groupedInfoWindowIdsAfterTabDragOut,
  infoWindowKey,
  infoWindowTabIdForKey,
  settingsWindowKey,
} from "./info-window-model.js";
import { createInfoWindowToolbarControls } from "./info-window-toolbar-controls.js";
import { opponentRevealWindowsFromState } from "./opponent-reveal-windows.js";
import { OpponentRevealWindowLayer } from "./OpponentRevealWindowLayer.js";
import { rollbackStatusForPlayer } from "./rollback-status.js";
import { defaultSettingsWindowRect, SettingsWindow } from "./SettingsWindow.js";
import { SettingsToggle } from "./SettingsToggle.js";
import { useControlDockTabs } from "./use-control-dock-tabs.js";
import { useControlPanelLayout } from "./use-control-panel-layout.js";
import { useFloatingWindowState } from "./use-floating-window-state.js";
import { useInfoWindowDragOut } from "./use-info-window-drag-out.js";
import { useInfoWindowConfig } from "./use-info-window-config.js";
import { useInfoWindowOrchestration } from "./use-info-window-orchestration.js";
import { useMatchClient } from "./useMatchClient.js";
import { useConcedeConfirmation } from "./use-concede-confirmation.js";
import { useFirstPlayerChoiceModal } from "./use-first-player-choice-modal.js";
import { useMatchRevealWindowStateStore } from "./use-match-reveal-window-state-store.js";
import { useMatchCollectionModal } from "./use-match-collection-modal.js";
import { useOrderedHandBoard } from "./use-ordered-hand-board.js";
import { useRevealWindowState } from "./use-reveal-window-state.js";
import {
  isFirstPlayerSetupClientState,
  isLobbyClientState,
  isMatchClientState,
} from "./useMatchClient-support.js";
export const MatchApp = (): React.JSX.Element => {
  const client = useMatchClient();
  const [previewCard, setPreviewCard] = useState<ClientCardModel>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMinimized, setPreviewMinimized] = useState(false);
  const [actionLogOpen, setActionLogOpen] = useState(false);
  const [actionLogMinimized, setActionLogMinimized] = useState(false);
  const [infoWindowMinimized, setInfoWindowMinimized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlDockActiveTabId, setControlDockActiveTabId] =
    useState<string>();
  const {
    board,
    cardCostSelection,
    clientState,
    decisionModal,
    decisionPrompt,
    pendingChoiceInstanceIds,
    decisionSelectedInstanceIds,
    selectedCardInstanceId,
    selectedDonInstanceIds,
  } = client.state;
  const matchState = isMatchClientState(clientState) ? clientState : undefined;
  const firstPlayerSetupState = isFirstPlayerSetupClientState(clientState)
    ? clientState
    : undefined;
  const lobbyState = isLobbyClientState(clientState) ? clientState : undefined;
  const firstPlayerChoiceModal = useFirstPlayerChoiceModal(
    firstPlayerSetupState,
    client.chooseFirstPlayer,
  );
  const visibleDecisionModal = firstPlayerChoiceModal.model ?? decisionModal;
  const setVisibleDecisionOption =
    firstPlayerChoiceModal.onOption ?? client.setDecisionOptionValue;
  const confirmVisibleDecision =
    firstPlayerChoiceModal.onConfirm ??
    (() => {
      void client.confirmDecision();
    });
  const scopedMatchState = matchState ?? firstPlayerSetupState;
  const matchScope =
    scopedMatchState === undefined && lobbyState === undefined
      ? undefined
      : String(scopedMatchState?.matchId ?? lobbyState?.lobbyId);
  const revealWindowStateStore = useMatchRevealWindowStateStore({
    enabled: matchScope !== undefined,
    matchId: matchScope,
  });
  const {
    controlRailWidth,
    controlDockHeight,
    controlDockActive,
    startControlRailResize,
    startControlDockResize,
    updateControlDockTarget,
    completeControlDockDrop,
    currentControlDockSlotRect,
  } = useControlPanelLayout({ layoutStore: revealWindowStateStore });
  const {
    activeTabId: infoWindowActiveTab,
    groupedTabIds: configuredGroupedInfoWindowIds,
    load: loadInfoWindowConfig,
    reset: resetInfoWindowConfig,
    setActiveTab: setInfoWindowActiveTab,
    setGroupedTabIds: setGroupedInfoWindowIds,
  } = useInfoWindowConfig(revealWindowStateStore);
  const {
    floatingWindowRects,
    activeFloatingWindowRects,
    activeOpenWindowIds,
    activeDockedWindowIds,
    loadFloatingWindowState,
    resetFloatingWindowState,
    updateFloatingWindowRect,
    updateFloatingWindowOpen,
    updateCollectionWindowOpen,
    dockFloatingWindows,
    reorderDockedWindow,
    updateDockedWindowRects,
  } = useFloatingWindowState({ matchScope, revealWindowStateStore });
  const {
    revealWindowState,
    activeRevealWindowState,
    updateRevealWindowState,
  } = useRevealWindowState({ matchScope, revealWindowStateStore });
  useEffect(() => {
    if (matchScope === undefined || revealWindowStateStore === undefined) {
      resetFloatingWindowState();
      resetInfoWindowConfig();
      return;
    }
    loadFloatingWindowState();
    loadInfoWindowConfig();
  }, [
    loadFloatingWindowState,
    loadInfoWindowConfig,
    matchScope,
    resetInfoWindowConfig,
    resetFloatingWindowState,
    revealWindowStateStore,
  ]);
  const currentPlayerId = client.currentPlayerId;
  const { displayBoard, moveHandCard } = useOrderedHandBoard({
    board,
    matchScope,
    currentPlayerId,
  });
  const playerSnapshot =
    currentPlayerId === undefined || matchState === undefined
      ? undefined
      : matchState.snapshot.players[currentPlayerId];
  const globalActions =
    decisionModal === undefined ? client.globalActions() : [];
  const concedeAction = useMemo(
    () => client.globalActions().find((action) => action.type === "concede"),
    [client],
  );
  const visibleGlobalActions = globalActions.filter(
    (action) => action.type !== "concede",
  );
  const {
    concedeDisabled,
    concedeConfirming,
    resetConcedeConfirmation,
    requestConcedeConfirmation,
  } = useConcedeConfirmation({
    actionAvailable: concedeAction !== undefined,
    actionInFlight: client.state.actionInFlight,
    matchActive: matchState?.snapshot.status === "active",
  });
  const rollbackStatus = rollbackStatusForPlayer(
    matchState?.snapshot,
    currentPlayerId,
  );
  const cardDisplay = (card: Parameters<typeof cardDisplayFromCatalog>[1]) =>
    cardDisplayFromCatalog(matchState?.cards, card);
  const cardModel = (card: Parameters<typeof cardModelFromCatalog>[1]) =>
    cardModelFromCatalog(matchState?.cards, card);
  const {
    previewHoveredCard,
    showCardPreview,
    closeCardPreview,
    togglePreviewOpen,
    toggleActionLogOpen,
    toggleSettingsOpen,
  } = createInfoWindowToolbarControls({
    previewOpen,
    actionLogOpen,
    settingsOpen,
    activeDockedWindowIds,
    configuredGroupedInfoWindowIds,
    setPreviewCard,
    setPreviewOpen,
    setPreviewMinimized,
    setActionLogOpen,
    setActionLogMinimized,
    setSettingsOpen,
    setInfoWindowMinimized,
    setInfoWindowActiveTab,
    setGroupedInfoWindowIds,
    setControlDockActiveTabId,
    updateFloatingWindowOpen,
  });
  const completeDockableWindowDrag = (
    windowKey: string,
    rect: WindowRect,
  ): WindowRect | undefined => {
    const dockRect = completeControlDockDrop(rect);
    if (dockRect === undefined) {
      return undefined;
    }
    dockFloatingWindows({ windowKeys: [windowKey], rect: dockRect });
    setControlDockActiveTabId(windowKey);
    return undefined;
  };
  const {
    clearCollectionModal,
    decisionModalCoveredByCollection,
    hostProps: collectionModalHostProps,
    onViewCollection,
    promptCoveredByCollection,
  } = useMatchCollectionModal({
    activeDockedWindowIds,
    activeFloatingWindowRects,
    activeOpenWindowIds,
    board,
    cardCostSelection,
    cardModel,
    completeDockableWindowDrag,
    currentPlayerId: client.currentPlayerId,
    decisionModal,
    disabled: client.state.actionInFlight,
    displayBoard,
    onConfirmDecision: () => {
      void client.confirmDecision();
    },
    onPreviewCard: previewHoveredCard,
    onToggleDecisionCard: client.toggleDecisionCard,
    updateCollectionWindowOpen,
    updateControlDockTarget,
    updateFloatingWindowRect,
  });
  const decisionPromptVisible =
    decisionModal === undefined && !promptCoveredByCollection;
  const opponentRevealWindows = opponentRevealWindowsFromState({
    currentPlayerId,
    playerSnapshot,
    matchScope,
    revealWindowState,
    activeDismissedRevealIds: activeRevealWindowState.dismissed,
    cardModel,
  });
  const actionLogEntries = useMemo(
    () =>
      playerSnapshot === undefined || matchState === undefined
        ? []
        : createActionLogEntries({
            events: playerSnapshot.view.events,
            catalog: matchState.cards,
            rollbackPoints:
              matchState.snapshot.rollback?.canRequest === true
                ? matchState.snapshot.rollback.points
                : [],
          }),
    [matchState, playerSnapshot],
  );
  const showPreviewWindow = previewOpen;
  const showActionLogWindow = actionLogOpen;
  const showSettingsWindow = settingsOpen;
  const {
    combineDropTarget,
    completeInfoGroupDrag,
    completeInfoWindowDrag,
    dockInfoWindowTabs,
    groupedInfoWindowIds,
    reorderInfoWindowTabs,
    showTabbedInfoWindow,
    standaloneInfoWindowIds,
    updateInfoWindowDragTargets,
    visibleInfoWindowIds,
  } = useInfoWindowOrchestration({
    activeDockedWindowIds,
    activeFloatingWindowRects,
    completeControlDockDrop,
    configuredGroupedInfoWindowIds,
    dockFloatingWindows,
    setActionLogMinimized,
    setControlDockActiveTabId,
    setGroupedInfoWindowIds,
    setInfoWindowActiveTab,
    setInfoWindowMinimized,
    setPreviewMinimized,
    showActionLogWindow,
    showPreviewWindow,
    showSettingsWindow,
    updateControlDockTarget,
    updateFloatingWindowRect,
  });
  const {
    controlDockTabs,
    dockedInfoTabIds,
    closeActionLogWindow,
    closeSettingsWindow,
    closeDockWindow,
  } = useControlDockTabs({
    activeDockedWindowIds,
    groupedInfoWindowIds,
    visibleInfoWindowIds,
    previewCard,
    showPreviewWindow,
    showActionLogWindow,
    showSettingsWindow,
    actionLogEntries,
    displayBoard,
    actionInFlight: client.state.actionInFlight,
    opponentRevealWindows,
    controlDockActiveTabId,
    closeCardPreview,
    setActionLogOpen,
    setActionLogMinimized,
    setSettingsOpen,
    setInfoWindowActiveTab,
    setGroupedInfoWindowIds,
    setControlDockActiveTabId,
    updateFloatingWindowOpen,
    clearCollectionModal,
    updateCollectionWindowOpen,
    dismissRevealWindow: (revealId) => {
      updateRevealWindowState((state) => {
        state.dismissed.add(revealId);
        state.minimized.delete(revealId);
        return state;
      });
    },
    requestRollback: (rollbackPointId) => {
      void client.requestRollback(rollbackPointId);
    },
    previewActionLogCard: (card) => {
      showCardPreview(actionLogCardModel(card));
    },
    previewCardModel: previewHoveredCard,
  });
  const reorderDockTab = (
    draggedWindowKey: string,
    targetWindowKey: string,
    placement: ReorderPlacement,
  ): void => {
    const draggedInfoTabId = infoWindowTabIdForKey(draggedWindowKey);
    const targetInfoTabId = infoWindowTabIdForKey(targetWindowKey);
    if (
      draggedInfoTabId !== undefined &&
      targetInfoTabId !== undefined &&
      activeDockedWindowIds.has(infoWindowKey) &&
      dockedInfoTabIds.includes(draggedInfoTabId) &&
      dockedInfoTabIds.includes(targetInfoTabId)
    ) {
      setGroupedInfoWindowIds(
        moveIdNear(
          dockedInfoTabIds,
          draggedInfoTabId,
          targetInfoTabId,
          placement,
        ),
      );
      setInfoWindowActiveTab(draggedInfoTabId);
    }
    reorderDockedWindow(draggedWindowKey, targetWindowKey, placement);
    setControlDockActiveTabId(draggedWindowKey);
  };
  const completePoppedOutInfoGroupDrag = (
    rect: WindowRect,
  ): WindowRect | undefined => {
    const dockRect = completeControlDockDrop(rect);
    if (dockRect === undefined) {
      return undefined;
    }
    dockInfoWindowTabs(
      dockedInfoTabIds.length >= 2 ? dockedInfoTabIds : groupedInfoWindowIds,
      dockRect,
    );
    return undefined;
  };
  const { dragOutDockGroup, dragOutDockWindow, splitInfoWindowTab } =
    useInfoWindowDragOut({
      activeFloatingWindowRects,
      dockedInfoTabIds,
      groupedInfoWindowIds,
      currentControlDockSlotRect,
      updateFloatingWindowRect,
      updateFloatingWindowOpen,
      setControlDockActiveTabId,
      setGroupedInfoWindowIds,
      setInfoWindowActiveTab,
      setInfoWindowMinimized,
      setActionLogOpen,
      setSettingsOpen,
      onControlWindowDragMove: updateControlDockTarget,
      onDockableWindowDragEnd: completeDockableWindowDrag,
      onInfoWindowDragMove: updateInfoWindowDragTargets,
      onInfoWindowDragEnd: completeInfoWindowDrag,
      onInfoGroupDragEnd: completePoppedOutInfoGroupDrag,
      onDockInfoWindowGroupSplit: ({
        windowKeys,
        rect,
        replacedWindowKeys,
      }) => {
        dockFloatingWindows({
          windowKeys,
          rect,
          replacedWindowKeys,
        });
      },
    });
  useEffect(() => {
    if (matchScope === undefined || floatingWindowRects.scope !== matchScope) {
      return;
    }
    const nextPreviewOpen = activeOpenWindowIds.has(cardPreviewWindowKey);
    const nextActionLogOpen = activeOpenWindowIds.has(actionLogWindowKey);
    const nextSettingsOpen = activeOpenWindowIds.has(settingsWindowKey);
    setPreviewOpen(nextPreviewOpen);
    setActionLogOpen(nextActionLogOpen);
    setSettingsOpen(nextSettingsOpen);
    if (nextActionLogOpen && !nextPreviewOpen) {
      setInfoWindowActiveTab("log");
    }
  }, [activeOpenWindowIds, floatingWindowRects.scope, matchScope]);
  useEffect(() => {
    const dockRect = currentControlDockSlotRect();
    if (dockRect !== undefined) {
      updateDockedWindowRects(dockRect);
    }
  }, [
    activeDockedWindowIds.size,
    controlDockHeight,
    controlRailWidth,
    currentControlDockSlotRect,
    updateDockedWindowRects,
  ]);
  return (
    <main className="match-app">
      {displayBoard === undefined ? (
        <MatchLoadingPanel clientState={clientState} />
      ) : (
        <BoardLayout
          board={displayBoard}
          decisionPrompt={decisionPromptVisible ? decisionPrompt : undefined}
          selectedCardInstanceId={selectedCardInstanceId}
          pendingChoiceInstanceIds={pendingChoiceInstanceIds}
          decisionSelectedInstanceIds={decisionSelectedInstanceIds}
          selectedDonInstanceIds={selectedDonInstanceIds}
          cardActions={client.cardActions}
          actionDisabled={client.state.actionInFlight}
          onCardClick={client.selectCard}
          onCardAction={(actionIndex) => {
            void client.submitAction(actionIndex);
          }}
          onPreviewCard={previewHoveredCard}
          onMoveHandCard={moveHandCard}
          onViewCollection={onViewCollection}
          onBackgroundClick={() => {
            client.selectCard(undefined);
          }}
        />
      )}
      <ControlRail
        errors={client.state.errors}
        globalActions={visibleGlobalActions}
        disabled={client.state.actionInFlight}
        matchStatus={matchState?.snapshot.status}
        width={controlRailWidth}
        dockHeight={controlDockHeight}
        dockActive={controlDockActive}
        dockTabs={controlDockTabs}
        activeDockTabId={controlDockActiveTabId}
        onResizePointerDown={startControlRailResize}
        onDockResizePointerDown={startControlDockResize}
        onDockTabChange={setControlDockActiveTabId}
        onDockTabClose={closeDockWindow}
        onDockTabDragOut={dragOutDockWindow}
        onDockTabReorder={reorderDockTab}
        onDockGroupDragOut={
          dockedInfoTabIds.length >= 2 ? dragOutDockGroup : undefined
        }
        onAction={(actionIndex) => {
          resetConcedeConfirmation();
          void client.submitAction(actionIndex);
        }}
        onNewMatch={() => {
          resetConcedeConfirmation();
          void client.createNewMatch();
        }}
        onRematch={() => {
          resetConcedeConfirmation();
          void client.requestRematch();
        }}
        rollbackStatus={rollbackStatus}
        onCancelRollback={() => {
          void client.cancelRollback();
        }}
        previewControl={
          <CardPreviewToggle open={previewOpen} onToggle={togglePreviewOpen} />
        }
        actionLogControl={
          <ActionLogToggle
            open={actionLogOpen}
            onToggle={toggleActionLogOpen}
          />
        }
        settingsControl={
          <SettingsToggle open={settingsOpen} onToggle={toggleSettingsOpen} />
        }
        concedeDisabled={concedeDisabled}
        concedeConfirming={concedeConfirming}
        lobbyDeckState={lobbyState}
        deckSubmissionDisabled={client.state.actionInFlight}
        onSubmitDeckHash={client.submitLobbyDeckHash}
        onConcede={() => {
          if (concedeAction === undefined || !requestConcedeConfirmation()) {
            return;
          }
          void client.submitAction(concedeAction.index);
        }}
      />
      <DecisionModalHost
        model={
          !decisionModalCoveredByCollection ? visibleDecisionModal : undefined
        }
        disabled={client.state.actionInFlight}
        cardDisplay={cardDisplay}
        onToggleCard={client.toggleDecisionCard}
        onChooseTrigger={client.chooseDecisionTriggerValue}
        onQuantity={client.setDecisionQuantityValue}
        onOption={setVisibleDecisionOption}
        onActionOption={client.setDecisionActionOptionValue}
        onPreviewCard={previewHoveredCard}
        onMoveOrderedCard={client.moveDecisionCard}
        onPlacementDestination={client.setDecisionPlacementDestination}
        onConfirm={confirmVisibleDecision}
      />
      <CollectionModalHost {...collectionModalHostProps} />
      <OpponentRevealWindowLayer
        windows={opponentRevealWindows}
        activeDockedWindowIds={activeDockedWindowIds}
        activeFloatingWindowRects={activeFloatingWindowRects}
        minimizedRevealIds={activeRevealWindowState.minimized}
        onToggleMinimized={(revealId) => {
          updateRevealWindowState((state) => {
            if (state.minimized.has(revealId)) {
              state.minimized.delete(revealId);
            } else {
              state.minimized.add(revealId);
            }
            return state;
          });
        }}
        onPreviewCard={previewHoveredCard}
        onClose={(revealId) => {
          updateRevealWindowState((state) => {
            state.dismissed.add(revealId);
            state.minimized.delete(revealId);
            return state;
          });
        }}
        onRectChange={(windowKey, rect) => {
          updateFloatingWindowRect(windowKey, rect);
        }}
        onDragMove={updateControlDockTarget}
        onDragEnd={(windowKey, rect) =>
          completeDockableWindowDrag(windowKey, rect)
        }
      />
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
          onActiveTabChange={setInfoWindowActiveTab}
          onToggleMinimized={() => {
            setInfoWindowMinimized((current) => !current);
          }}
          onCloseActiveTab={(tabId) => {
            if (tabId === "preview") {
              closeCardPreview();
              return;
            }
            if (tabId === "settings") {
              setSettingsOpen(false);
              setInfoWindowActiveTab("preview");
              setGroupedInfoWindowIds(
                groupedInfoWindowIdsAfterTabDragOut(
                  groupedInfoWindowIds,
                  "settings",
                ),
              );
              updateFloatingWindowOpen(settingsWindowKey, false);
              return;
            }
            setActionLogOpen(false);
            setActionLogMinimized(false);
            setInfoWindowActiveTab("preview");
            setGroupedInfoWindowIds(
              groupedInfoWindowIdsAfterTabDragOut(groupedInfoWindowIds, "log"),
            );
            updateFloatingWindowOpen(actionLogWindowKey, false);
          }}
          onRectChange={(rect) => {
            updateFloatingWindowRect(infoWindowKey, rect);
          }}
          onDragMove={updateControlDockTarget}
          onDragEnd={completeInfoGroupDrag}
          onTabDragOut={splitInfoWindowTab}
          onTabReorder={reorderInfoWindowTabs}
          onRequestRollback={(rollbackPointId) => {
            void client.requestRollback(rollbackPointId);
          }}
          onPreviewCard={(card) => {
            showCardPreview(actionLogCardModel(card));
          }}
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
          onToggleMinimized={() => {
            setActionLogMinimized((current) => !current);
          }}
          onClose={closeActionLogWindow}
          onRectChange={(rect) => {
            updateFloatingWindowRect(actionLogWindowKey, rect);
          }}
          onDragMove={(rect) => {
            updateInfoWindowDragTargets("log", rect);
          }}
          onDragEnd={(rect) => {
            return completeInfoWindowDrag("log", rect);
          }}
          onRequestRollback={(rollbackPointId) => {
            void client.requestRollback(rollbackPointId);
          }}
          onPreviewCard={(card) => {
            showCardPreview(actionLogCardModel(card));
          }}
        />
      ) : null}
      {standaloneInfoWindowIds.includes("preview") &&
      !dockedInfoTabIds.includes("preview") ? (
        <CardPreviewWindow
          card={previewCard}
          className={
            combineDropTarget === "preview"
              ? "is-combine-drop-target"
              : undefined
          }
          minimized={previewMinimized}
          initialRect={
            activeFloatingWindowRects[cardPreviewWindowKey] ??
            defaultCardPreviewWindowRect
          }
          onToggleMinimized={() => {
            setPreviewMinimized((current) => !current);
          }}
          onClose={closeCardPreview}
          onRectChange={(rect) => {
            updateFloatingWindowRect(cardPreviewWindowKey, rect);
          }}
          onDragMove={(rect) => {
            updateInfoWindowDragTargets("preview", rect);
          }}
          onDragEnd={(rect) => {
            return completeInfoWindowDrag("preview", rect);
          }}
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
          onClose={closeSettingsWindow}
          onRectChange={(rect) => {
            updateFloatingWindowRect(settingsWindowKey, rect);
          }}
          onDragMove={(rect) => {
            updateInfoWindowDragTargets("settings", rect);
          }}
          onDragEnd={(rect) => {
            return completeInfoWindowDrag("settings", rect);
          }}
        />
      ) : null}
    </main>
  );
};
