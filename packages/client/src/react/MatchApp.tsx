import { useEffect, useState } from "react";
import type { ClientCardModel } from "../view-model.js";
import { ActionLogToggle } from "./ActionLogToggle.js";
import { actionLogCardModel } from "./card-model.js";
import { CardPreviewToggle } from "./CardPreviewToggle.js";
import type { WindowRect } from "./FloatingWindow.js";
import { MatchBoardSurface } from "./MatchBoardSurface.js";
import { MatchControlPanel } from "./MatchControlPanel.js";
import {
  actionLogWindowKey,
  cardPreviewWindowKey,
  settingsWindowKey,
} from "./info-window-model.js";
import { createInfoWindowToolbarControls } from "./info-window-toolbar-controls.js";
import { opponentRevealWindowsFromState } from "./opponent-reveal-windows.js";
import { MatchInfoWindows } from "./MatchInfoWindows.js";
import { MatchInteractionModals } from "./MatchInteractionModals.js";
import { SettingsToggle } from "./SettingsToggle.js";
import { useControlDockTabs } from "./use-control-dock-tabs.js";
import { useControlPanelLayout } from "./use-control-panel-layout.js";
import { useFloatingWindowState } from "./use-floating-window-state.js";
import { useInfoWindowConfig } from "./use-info-window-config.js";
import { useInfoWindowOrchestration } from "./use-info-window-orchestration.js";
import { useMatchClient } from "./useMatchClient.js";
import { useConcedeConfirmation } from "./use-concede-confirmation.js";
import { useMatchRevealWindowStateStore } from "./use-match-reveal-window-state-store.js";
import { useMatchAppSession } from "./use-match-app-session.js";
import { useMatchAppWindowDocking } from "./use-match-app-window-docking.js";
import { useMatchCollectionModal } from "./use-match-collection-modal.js";
import { useRevealWindowState } from "./use-reveal-window-state.js";
export interface MatchAppProps {
  readonly accountSessionToken: string;
}

export const MatchApp = ({
  accountSessionToken,
}: MatchAppProps): React.JSX.Element => {
  const client = useMatchClient({ accountSessionToken });
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
  const {
    actionLogEntries,
    cardDisplay,
    cardModel,
    concedeAction,
    confirmVisibleDecision,
    currentPlayerId,
    displayBoard,
    lobbyState,
    matchScope,
    matchState,
    moveHandCard,
    playerSnapshot,
    rollbackStatus,
    setVisibleDecisionOption,
    visibleDecisionModal,
    visibleGlobalActions,
  } = useMatchAppSession(client);
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
  const {
    dragOutDockGroup,
    dragOutDockWindow,
    reorderDockTab,
    splitInfoWindowTab,
  } = useMatchAppWindowDocking({
    activeDockedWindowIds,
    activeFloatingWindowRects,
    completeControlDockDrop,
    completeDockableWindowDrag,
    completeInfoWindowDrag,
    currentControlDockSlotRect,
    dockedInfoTabIds,
    dockFloatingWindows,
    dockInfoWindowTabs,
    groupedInfoWindowIds,
    reorderDockedWindow,
    setActionLogOpen,
    setControlDockActiveTabId,
    setGroupedInfoWindowIds,
    setInfoWindowActiveTab,
    setInfoWindowMinimized,
    setSettingsOpen,
    updateControlDockTarget,
    updateFloatingWindowOpen,
    updateFloatingWindowRect,
    updateInfoWindowDragTargets,
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
      <MatchBoardSurface
        board={displayBoard}
        clientState={clientState}
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
      <MatchControlPanel
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
        accountLoadouts={client.state.accountLoadouts}
        accountLoadoutsStatus={client.state.accountLoadoutsStatus}
        accountLoadoutsError={client.state.accountLoadoutsError}
        deckSubmissionDisabled={client.state.actionInFlight}
        onSubmitLoadout={client.submitLobbyLoadout}
        onConcede={() => {
          if (concedeAction === undefined || !requestConcedeConfirmation()) {
            return;
          }
          void client.submitAction(concedeAction.index);
        }}
      />
      <MatchInteractionModals
        actionInFlight={client.state.actionInFlight}
        cardDisplay={cardDisplay}
        collectionModalHostProps={collectionModalHostProps}
        decisionModal={visibleDecisionModal}
        decisionModalCoveredByCollection={decisionModalCoveredByCollection}
        opponentRevealWindowLayerProps={{
          windows: opponentRevealWindows,
          activeDockedWindowIds,
          activeFloatingWindowRects,
          minimizedRevealIds: activeRevealWindowState.minimized,
          onToggleMinimized: (revealId) => {
            updateRevealWindowState((state) => {
              if (state.minimized.has(revealId)) {
                state.minimized.delete(revealId);
              } else {
                state.minimized.add(revealId);
              }
              return state;
            });
          },
          onPreviewCard: previewHoveredCard,
          onClose: (revealId) => {
            updateRevealWindowState((state) => {
              state.dismissed.add(revealId);
              state.minimized.delete(revealId);
              return state;
            });
          },
          onRectChange: (windowKey, rect) => {
            updateFloatingWindowRect(windowKey, rect);
          },
          onDragMove: updateControlDockTarget,
          onDragEnd: (windowKey, rect) =>
            completeDockableWindowDrag(windowKey, rect),
        }}
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
      <MatchInfoWindows
        actionLogEntries={actionLogEntries}
        actionLogMinimized={actionLogMinimized}
        activeDockedWindowIds={activeDockedWindowIds}
        activeFloatingWindowRects={activeFloatingWindowRects}
        closeActionLogWindow={closeActionLogWindow}
        closeCardPreview={closeCardPreview}
        closeSettingsWindow={closeSettingsWindow}
        combineDropTarget={combineDropTarget}
        completeInfoGroupDrag={completeInfoGroupDrag}
        completeInfoWindowDrag={completeInfoWindowDrag}
        dockedInfoTabIds={dockedInfoTabIds}
        groupedInfoWindowIds={groupedInfoWindowIds}
        infoWindowActiveTab={infoWindowActiveTab}
        infoWindowMinimized={infoWindowMinimized}
        onPreviewActionLogCard={(card) => {
          showCardPreview(actionLogCardModel(card));
        }}
        onRequestRollback={(rollbackPointId) => {
          void client.requestRollback(rollbackPointId);
        }}
        previewCard={previewCard}
        previewMinimized={previewMinimized}
        reorderInfoWindowTabs={reorderInfoWindowTabs}
        setActionLogMinimized={setActionLogMinimized}
        setActionLogOpen={setActionLogOpen}
        setGroupedInfoWindowIds={setGroupedInfoWindowIds}
        setInfoWindowActiveTab={setInfoWindowActiveTab}
        setInfoWindowMinimized={setInfoWindowMinimized}
        setPreviewMinimized={setPreviewMinimized}
        setSettingsOpen={setSettingsOpen}
        showActionLogWindow={showActionLogWindow}
        showSettingsWindow={showSettingsWindow}
        showTabbedInfoWindow={showTabbedInfoWindow}
        splitInfoWindowTab={splitInfoWindowTab}
        standaloneInfoWindowIds={standaloneInfoWindowIds}
        updateControlDockTarget={updateControlDockTarget}
        updateFloatingWindowOpen={updateFloatingWindowOpen}
        updateFloatingWindowRect={updateFloatingWindowRect}
        updateInfoWindowDragTargets={updateInfoWindowDragTargets}
      />
    </main>
  );
};
