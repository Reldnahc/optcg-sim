import { useEffect, useState, type CSSProperties } from "react";
import type { ClientCardModel } from "../view-model.js";
import { ActionLogButton } from "./ActionLogButton.js";
import { appRoutePath } from "./app-route.js";
import { actionLogCardModel } from "./card-model.js";
import { CardPreviewButton } from "./CardPreviewButton.js";
import type { WindowRect } from "./FloatingWindow.js";
import { MatchBoardSurface } from "./MatchBoardSurface.js";
import { MatchControlPanel } from "./MatchControlPanel.js";
import {
  actionLogWindowKey,
  cardPreviewWindowKey,
  settingsWindowKey,
} from "./info-window-model.js";
import { createInfoWindowToolbarControls } from "./info-window-toolbar-controls.js";
import {
  opponentRevealWindowsFromState,
  revealWindowKey,
} from "./opponent-reveal-windows.js";
import { LobbyDeckPanel } from "./LobbyDeckPanel.js";
import { MatchInfoWindows } from "./MatchInfoWindows.js";
import { MatchInteractionModals } from "./MatchInteractionModals.js";
import { MatchVisualSettingsProvider } from "./match-visual-settings-context.js";
import { SettingsButton } from "./SettingsButton.js";
import {
  endTurnConfirmationActions,
  isEndTurnAction,
  useEndTurnConfirmation,
} from "./use-end-turn-confirmation.js";
import { useControlDockTabs } from "./use-control-dock-tabs.js";
import { useEffectSpotlight } from "./use-effect-spotlight.js";
import { activeEffectTextSourcesForSpotlight } from "./effect-spotlight-source.js";
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
import { usePersistedMatchVisualSettings } from "./use-persisted-match-visual-settings.js";
import { useRevealWindowState } from "./use-reveal-window-state.js";
import type { MatchClientUi } from "./useMatchClient-support.js";
export interface MatchAppProps {
  readonly accountSessionToken?: string | undefined;
  readonly client?: MatchClientUi | undefined;
  readonly replayControls?: React.ReactNode | undefined;
}

const hexColorToRgb = (hexColor: string): string => {
  const normalized = /^#[0-9a-f]{6}$/u.test(hexColor) ? hexColor : "#000000";
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `${String(red)}, ${String(green)}, ${String(blue)}`;
};

const backgroundImageStyle = ({
  fit,
  cropZoom,
  positionX,
  positionY,
}: {
  readonly fit: string;
  readonly cropZoom: number;
  readonly positionX: number;
  readonly positionY: number;
}): {
  readonly size: string;
  readonly repeat: string;
  readonly position: string;
} => {
  switch (fit) {
    case "stretch":
      return { size: "100% 100%", repeat: "no-repeat", position: "center" };
    case "fit":
      return { size: "contain", repeat: "no-repeat", position: "center" };
    case "tile":
      return { size: "auto", repeat: "repeat", position: "0 0" };
    case "crop":
    default:
      return {
        size: cropZoom <= 100 ? "cover" : `${String(cropZoom)}% auto`,
        repeat: "no-repeat",
        position: `${String(positionX)}% ${String(positionY)}%`,
      };
  }
};

export const MatchApp = ({
  accountSessionToken,
  client: suppliedClient,
  replayControls,
}: MatchAppProps): React.JSX.Element => {
  const visualSettings = usePersistedMatchVisualSettings();
  const liveClient = useMatchClient({
    accountSessionToken: accountSessionToken ?? "replay-disabled",
    confirmAttachDon: visualSettings.confirmAttachDon,
    quickPayActivateMainCosts: visualSettings.quickPayActivateMainCosts,
    enabled: suppliedClient === undefined,
  });
  const client = suppliedClient ?? liveClient;
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
    submitVisibleDecisionActionOption,
    submitVisibleDecisionOption,
    submitVisibleDecisionQuantity,
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
    activeFloatingWindowZIndexes,
    loadFloatingWindowState,
    resetFloatingWindowState,
    activateFloatingWindow,
    updateFloatingWindowRect,
    openFloatingWindowGroup,
    updateFloatingWindowOpen,
    updateCollectionWindowOpen,
    syncExternalFloatingWindows,
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
    endTurnConfirming,
    requestEndTurnConfirmation,
    resetEndTurnConfirmation,
  } = useEndTurnConfirmation({
    enabled: visualSettings.confirmEndTurn,
    actionAvailable: visibleGlobalActions.some(isEndTurnAction),
    actionInFlight: client.state.actionInFlight,
  });
  const controlGlobalActions = endTurnConfirmationActions(
    visibleGlobalActions,
    visualSettings.confirmEndTurn && endTurnConfirming,
  );
  const {
    previewHoveredCard,
    showCardPreview,
    closeCardPreview,
    focusPreviewWindow,
    focusActionLogWindow,
    focusSettingsWindow,
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
    activeFloatingWindowZIndexes,
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
    activateFloatingWindow,
    updateControlDockTarget,
    updateFloatingWindowRect,
  });
  const decisionPromptVisible =
    decisionModal === undefined && !promptCoveredByCollection;
  const opponentRevealWindows = opponentRevealWindowsFromState({
    currentPlayerId,
    playerSnapshot,
    matchScope,
    board: displayBoard,
    revealWindowState,
    activeDismissedRevealIds: activeRevealWindowState.dismissed,
    cardModel,
  });
  const activeRevealWindowKeySignature = opponentRevealWindows
    .map((revealWindow) => revealWindowKey(revealWindow.revealId))
    .join("\n");
  useEffect(() => {
    syncExternalFloatingWindows({
      windowKeys:
        activeRevealWindowKeySignature === ""
          ? []
          : activeRevealWindowKeySignature.split("\n"),
      managedWindowKeyPrefix: "reveal:",
    });
  }, [activeRevealWindowKeySignature, syncExternalFloatingWindows]);
  const showPreviewWindow = previewOpen;
  const showActionLogWindow = actionLogOpen;
  const showSettingsWindow = settingsOpen;
  const activeEffectTextSources =
    playerSnapshot === undefined
      ? undefined
      : activeEffectTextSourcesForSpotlight({
          activeEffectText: playerSnapshot.view.activeEffectText,
          pendingDecision: playerSnapshot.view.pendingDecision,
          events: playerSnapshot.view.events,
        });
  const effectSpotlight = useEffectSpotlight({
    active: undefined,
    ...(activeEffectTextSources === undefined
      ? {}
      : { activeSources: activeEffectTextSources }),
    pendingDecisionId: playerSnapshot?.view.pendingDecision?.id,
  });
  const effectSpotlightCard =
    effectSpotlight === undefined
      ? undefined
      : cardModel(effectSpotlight.active.source);
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
    openFloatingWindowGroup,
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

  const zoneGuideStrength = visualSettings.zoneGuideVisibility / 100;
  const zoneBackgroundStrength = visualSettings.zoneBackgroundVisibility / 100;
  const zoneGuideBorderAlpha = zoneGuideStrength * 0.44;
  const zoneGuideLabelAlpha = zoneGuideStrength * 0.9;
  const zoneGuideBackgroundAlpha = zoneBackgroundStrength;
  const windowSurfaceRgb = hexColorToRgb(visualSettings.windowColor);
  const playmatSurfaceRgb = hexColorToRgb(visualSettings.playmatColor);
  const backgroundStyle = backgroundImageStyle({
    fit: visualSettings.backgroundImageFit,
    cropZoom: visualSettings.backgroundImageCropZoom,
    positionX: visualSettings.backgroundImagePositionX,
    positionY: visualSettings.backgroundImagePositionY,
  });
  const backgroundImageEnabled = visualSettings.backgroundImageUrl.length > 0;
  const matchAppStyle = {
    "--match-background-color": visualSettings.backgroundColor,
    "--match-background-size": backgroundStyle.size,
    "--match-background-repeat": backgroundStyle.repeat,
    "--match-background-position": backgroundStyle.position,
    "--match-window-color-rgb": windowSurfaceRgb,
    "--match-window-opacity": (visualSettings.windowOpacity / 100).toFixed(3),
    "--match-playmat-color-rgb": playmatSurfaceRgb,
    "--match-playmat-opacity": (visualSettings.playmatOpacity / 100).toFixed(3),
    "--zone-guide-border-alpha": zoneGuideBorderAlpha.toFixed(3),
    "--zone-guide-background-alpha": zoneGuideBackgroundAlpha.toFixed(3),
    "--zone-guide-label-alpha": zoneGuideLabelAlpha.toFixed(3),
    ...(backgroundImageEnabled
      ? {
          backgroundImage: `url(${JSON.stringify(
            visualSettings.backgroundImageUrl,
          )})`,
        }
      : {}),
  } as CSSProperties &
    Record<
      | "--zone-guide-background-alpha"
      | "--zone-guide-border-alpha"
      | "--zone-guide-label-alpha"
      | "--match-window-color-rgb"
      | "--match-window-opacity"
      | "--match-playmat-color-rgb"
      | "--match-playmat-opacity"
      | "--match-background-color"
      | "--match-background-size"
      | "--match-background-repeat"
      | "--match-background-position",
      string
    >;
  const matchAppClassName = [
    "match-app",
    visualSettings.reducedMotion ? "is-reduced-motion" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <MatchVisualSettingsProvider value={visualSettings}>
      <main className={matchAppClassName} style={matchAppStyle}>
        <MatchBoardSurface
          board={displayBoard}
          clientState={clientState}
          presentationEvents={playerSnapshot?.view.events ?? []}
          decisionPrompt={decisionPromptVisible ? decisionPrompt : undefined}
          effectSpotlightActive={effectSpotlight?.active}
          effectSpotlightCard={effectSpotlightCard}
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
        {replayControls === undefined ? null : (
          <div className="replay-match-controls" data-replay-match-surface="">
            {replayControls}
          </div>
        )}
        {lobbyState === undefined ? null : (
          <LobbyDeckPanel
            disabled={client.state.actionInFlight}
            lobbyState={lobbyState}
            loadouts={client.state.accountLoadouts}
            loadoutsStatus={client.state.accountLoadoutsStatus}
            loadoutsError={client.state.accountLoadoutsError}
            requirePlayableValidation={
              client.state.accountLoadoutValidationRequired
            }
            onRefreshLoadouts={client.refreshAccountLoadouts}
            onSubmitLoadout={client.submitLobbyLoadout}
          />
        )}
        <MatchControlPanel
          errors={client.state.errors}
          globalActions={controlGlobalActions}
          disabled={client.state.actionInFlight}
          selfLabel={displayBoard?.selfLabel}
          opponentLabel={displayBoard?.opponentLabel}
          selfTimer={displayBoard?.selfTimer}
          opponentTimer={displayBoard?.opponentTimer}
          selfIsTurnPlayer={displayBoard?.selfIsTurnPlayer}
          opponentIsTurnPlayer={displayBoard?.opponentIsTurnPlayer}
          selfConnectionStatus={displayBoard?.selfConnectionStatus}
          opponentConnectionStatus={displayBoard?.opponentConnectionStatus}
          turnState={playerSnapshot?.view.turn}
          matchStatus={matchState?.snapshot.status}
          rematchStatus={client.state.rematchStatus}
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
            const action = visibleGlobalActions.find(
              (candidate) => candidate.index === actionIndex,
            );
            if (
              visualSettings.confirmEndTurn &&
              isEndTurnAction(action) &&
              !requestEndTurnConfirmation()
            ) {
              return;
            }
            resetEndTurnConfirmation();
            void client.submitAction(actionIndex);
          }}
          onHome={() => {
            resetConcedeConfirmation();
            window.location.assign(appRoutePath("dashboard"));
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
            <CardPreviewButton
              open={previewOpen}
              onActivate={focusPreviewWindow}
            />
          }
          actionLogControl={
            <ActionLogButton
              open={actionLogOpen}
              onActivate={focusActionLogWindow}
            />
          }
          settingsControl={
            <SettingsButton
              open={settingsOpen}
              onActivate={focusSettingsWindow}
            />
          }
          concedeDisabled={concedeDisabled}
          concedeConfirming={concedeConfirming}
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
          cardModel={cardModel}
          collectionModalHostProps={collectionModalHostProps}
          decisionModal={visibleDecisionModal}
          decisionModalCoveredByCollection={decisionModalCoveredByCollection}
          opponentRevealWindowLayerProps={{
            windows: opponentRevealWindows,
            activeDockedWindowIds,
            activeFloatingWindowRects,
            activeFloatingWindowZIndexes,
            minimizedRevealIds: activeRevealWindowState.minimized,
            onActivateWindow: activateFloatingWindow,
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
          onSubmitQuantity={submitVisibleDecisionQuantity}
          onSubmitOption={submitVisibleDecisionOption}
          onSubmitActionOption={submitVisibleDecisionActionOption}
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
          activeFloatingWindowZIndexes={activeFloatingWindowZIndexes}
          activateFloatingWindow={activateFloatingWindow}
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
    </MatchVisualSettingsProvider>
  );
};
