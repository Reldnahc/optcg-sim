import { useEffect, useMemo, useState } from "react";

import type { InstanceId } from "@optcg/types";

import { createActionLogEntries } from "../action-log.js";
import {
  createCollectionDecisionSurface,
  usesCollectionCardCostSurface,
} from "../interactions/decision-surface.js";
import type { ClientCardModel } from "../view-model.js";
import { ActionLogToggle } from "./ActionLogToggle.js";
import { ActionLogWindow, defaultActionLogWindowRect } from "./ActionLogWindow.js";
import { BoardLayout } from "./BoardLayout.js";
import { createBrowserPersistentStorage } from "./browser-storage.js";
import {
  actionLogCardModel,
  cardDisplayFromCatalog,
  cardModelFromCatalog,
} from "./card-model.js";
import { CardPreviewToggle } from "./CardPreviewToggle.js";
import { CardPreviewWindow, defaultCardPreviewWindowRect } from "./CardPreviewWindow.js";
import type { CollectionModalModel } from "./CollectionModalHost.js";
import { CollectionModalHost } from "./CollectionModalHost.js";
import {
  collectionModalFromWindowKey,
  collectionWindowKey,
  defaultCollectionWindowRect,
} from "./collection-window-model.js";
import { ControlRail } from "./ControlRail.js";
import { DecisionModalHost } from "./DecisionModalHost.js";
import type { WindowRect } from "./FloatingWindow.js";
import { moveIdNear, type ReorderPlacement } from "./drag-reorder.js";
import { combineDropTargetForWindow } from "./floating-window-grouping.js";
import type { GroupableWindow } from "./floating-window-grouping.js";
import { InfoTabbedWindow } from "./InfoTabbedWindow.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";
import {
  actionLogWindowKey,
  cardPreviewWindowKey,
  floatingGroupedInfoWindowIds,
  groupedInfoWindowIdsAfterDrop,
  groupedInfoWindowIdsAfterTabDragOut,
  infoWindowKey,
  infoWindowTabIdForKey,
  infoWindowKeyForTab,
  infoWindowRect,
  settingsWindowKey,
  standaloneInfoWindowIds as standaloneInfoWindowIdsFromState,
  visibleInfoWindowIds as visibleInfoWindowIdsFromState,
} from "./info-window-model.js";
import {
  opponentRevealWindowsFromState,
} from "./opponent-reveal-windows.js";
import { OpponentRevealWindowLayer } from "./OpponentRevealWindowLayer.js";
import { rollbackStatusForPlayer } from "./rollback-status.js";
import { defaultSettingsWindowRect, SettingsWindow } from "./SettingsWindow.js";
import { sourceZoneCards } from "./source-zone-cards.js";
import { useControlDockTabs } from "./use-control-dock-tabs.js";
import { useControlPanelLayout } from "./use-control-panel-layout.js";
import { useFloatingWindowState } from "./use-floating-window-state.js";
import { useInfoWindowDragOut } from "./use-info-window-drag-out.js";
import { useInfoWindowConfig } from "./use-info-window-config.js";
import { useMatchClient } from "./useMatchClient.js";
import { useOrderedHandBoard } from "./use-ordered-hand-board.js";
import { useRevealWindowState } from "./use-reveal-window-state.js";
import type { RevealWindowStateStore } from "./window-state-store.js";
import { createRevealWindowStateStore } from "./window-state-store.js";

export const MatchApp = (): React.JSX.Element => {
  const client = useMatchClient();
  const [collectionModal, setCollectionModal] = useState<
    CollectionModalModel | undefined
  >(undefined);
  const [collectionMinimized, setCollectionMinimized] = useState(false);
  const [previewCard, setPreviewCard] = useState<ClientCardModel | undefined>(
    undefined,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMinimized, setPreviewMinimized] = useState(false);
  const [actionLogOpen, setActionLogOpen] = useState(false);
  const [actionLogMinimized, setActionLogMinimized] = useState(false);
  const [infoWindowMinimized, setInfoWindowMinimized] = useState(false);
  const [combineDropTarget, setCombineDropTarget] = useState<
    InfoWindowTabId | undefined
  >(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const matchState =
    clientState !== undefined && "matchId" in clientState
      ? clientState
      : undefined;
  const matchScope =
    matchState === undefined ? undefined : String(matchState.matchId);
  const revealWindowStateStore = useMemo<RevealWindowStateStore | undefined>(
    () =>
      matchState === undefined || typeof window === "undefined"
        ? undefined
        : createRevealWindowStateStore({
            storage: createBrowserPersistentStorage(),
            matchId: matchState.matchId,
          }),
    [matchState?.matchId],
  );
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
  const lobbyState =
    clientState !== undefined && "lobbyId" in clientState
      ? clientState
      : undefined;
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
  const [concedeConfirming, setConcedeConfirming] = useState(false);
  useEffect(() => {
    if (concedeAction === undefined) {
      setConcedeConfirming(false);
    }
  }, [concedeAction]);
  const visibleGlobalActions = globalActions.filter(
    (action) => action.type !== "concede",
  );
  const concedeDisabled =
    client.state.actionInFlight ||
    concedeAction === undefined ||
    matchState?.snapshot.status !== "active";
  const rollbackStatus = rollbackStatusForPlayer(
    matchState?.snapshot,
    currentPlayerId,
  );
  useEffect(() => {
    if (concedeDisabled) {
      setConcedeConfirming(false);
    }
  }, [concedeDisabled]);
  const cardDisplay = (card: Parameters<typeof cardDisplayFromCatalog>[1]) =>
    cardDisplayFromCatalog(matchState?.cards, card);
  const cardModel = (card: Parameters<typeof cardModelFromCatalog>[1]) =>
    cardModelFromCatalog(matchState?.cards, card);
  const previewHoveredCard = (card: ClientCardModel): void => {
    setPreviewCard(card);
    if (previewOpen) {
      setInfoWindowActiveTab("preview");
      setInfoWindowMinimized(false);
    }
  };
  const openCardPreview = (): void => {
    setPreviewOpen(true);
    setPreviewMinimized(false);
    setInfoWindowMinimized(false);
    setInfoWindowActiveTab("preview");
    updateFloatingWindowOpen(cardPreviewWindowKey, true);
  };
  const closeCardPreview = (): void => {
    setPreviewOpen(false);
    setPreviewMinimized(false);
    setInfoWindowActiveTab("log");
    setGroupedInfoWindowIds(
      groupedInfoWindowIdsAfterTabDragOut(
        configuredGroupedInfoWindowIds,
        "preview",
      ),
    );
    updateFloatingWindowOpen(cardPreviewWindowKey, false);
  };
  const togglePreviewOpen = (): void => {
    if (previewOpen) {
      closeCardPreview();
      return;
    }
    openCardPreview();
  };
  const collectionDecisionSurface = createCollectionDecisionSurface(
    decisionModal,
    client.currentPlayerId,
  );
  const decisionCollectionModal =
    collectionDecisionSurface === undefined
      ? undefined
      : {
          title: collectionDecisionSurface.title,
          cards: collectionDecisionSurface.model.cards.map((choice) =>
            cardModel(choice.card),
          ),
          selection: {
            selectedInstanceIds:
              collectionDecisionSurface.model.selectedInstanceIds.map(String),
            selectableInstanceIds: collectionDecisionSurface.model.cards
              .filter((choice) => choice.selectable)
              .map((choice) => String(choice.card.instanceId)),
            canConfirm: collectionDecisionSurface.model.canConfirm,
            confirmLabel: collectionDecisionSurface.model.confirmLabel,
          },
        };
  const cardCostCollectionModal =
    board === undefined ||
    cardCostSelection === undefined ||
    !usesCollectionCardCostSurface(cardCostSelection.source)
      ? undefined
      : {
          title: cardCostSelection.title,
          cards: sourceZoneCards(board, cardCostSelection.source),
          selection: {
            selectedInstanceIds: cardCostSelection.selectedInstanceIds,
            selectableInstanceIds: cardCostSelection.selectableInstanceIds,
            canConfirm: cardCostSelection.canConfirm,
            confirmLabel: cardCostSelection.confirmLabel,
            ...(cardCostSelection.orderHint === undefined
              ? {}
              : { orderHint: cardCostSelection.orderHint }),
          },
        };
  const persistedCollectionModal =
    displayBoard === undefined
      ? undefined
      : [...activeOpenWindowIds]
          .flatMap((key) => {
            const modal = collectionModalFromWindowKey(key, displayBoard);
            return modal === undefined ? [] : [modal];
          })
          .sort((left, right) => left.title.localeCompare(right.title))[0];
  const renderedCollectionModal =
    cardCostCollectionModal ??
    decisionCollectionModal ??
    collectionModal ??
    persistedCollectionModal;
  const decisionPromptVisible =
    decisionModal === undefined &&
    cardCostCollectionModal === undefined &&
    decisionCollectionModal === undefined;
  const renderedCollectionKey = renderedCollectionModal?.title;
  const collectionViewerKey =
    cardCostCollectionModal === undefined &&
    decisionCollectionModal === undefined
      ? renderedCollectionModal?.title
      : undefined;
  const collectionViewerWindowKey =
    collectionViewerKey === undefined
      ? undefined
      : collectionWindowKey(collectionViewerKey);
  const collectionViewerDocked =
    collectionViewerWindowKey !== undefined &&
    activeDockedWindowIds.has(collectionViewerWindowKey);
  const collectionPresentation =
    collectionViewerKey === undefined ? "modal" : "window";
  useEffect(() => {
    setCollectionMinimized(false);
  }, [renderedCollectionKey]);
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
  const visibleInfoWindowIds = visibleInfoWindowIdsFromState({
    showPreviewWindow,
    showActionLogWindow,
    showSettingsWindow,
  });
  const configuredVisibleGroupedInfoWindowIds = floatingGroupedInfoWindowIds({
    visibleIds: visibleInfoWindowIds,
    groupedIds: configuredGroupedInfoWindowIds,
    dockedWindowIds: activeDockedWindowIds,
  });
  const groupedInfoWindowIds =
    configuredVisibleGroupedInfoWindowIds.length >= 2
      ? configuredVisibleGroupedInfoWindowIds
      : [];
  const standaloneInfoWindowIds = standaloneInfoWindowIdsFromState(
    visibleInfoWindowIds,
    groupedInfoWindowIds,
  );
  const showTabbedInfoWindow = groupedInfoWindowIds.length >= 2;
  const {
    controlDockTabs,
    controlDockActiveTabId,
    setControlDockActiveTabId,
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
    closeCardPreview,
    setActionLogOpen,
    setActionLogMinimized,
    setSettingsOpen,
    setInfoWindowActiveTab,
    setGroupedInfoWindowIds,
    updateFloatingWindowOpen,
    clearCollectionModal: () => {
      setCollectionModal(undefined);
    },
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
      previewHoveredCard(actionLogCardModel(card));
    },
    previewCardModel: previewHoveredCard,
  });
  const groupedInfoWindowRect =
    activeFloatingWindowRects[infoWindowKey] ??
    (groupedInfoWindowIds[0] === undefined
      ? undefined
      : infoWindowRect(groupedInfoWindowIds[0], activeFloatingWindowRects));
  const groupableInfoWindows: GroupableWindow<InfoWindowTabId>[] =
    visibleInfoWindowIds.map((id) => ({
      id,
      visible: true,
      rect:
        groupedInfoWindowIds.includes(id) && groupedInfoWindowRect !== undefined
          ? groupedInfoWindowRect
          : infoWindowRect(id, activeFloatingWindowRects),
    }));
  const matchingCombineDropTarget = (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ): InfoWindowTabId | undefined =>
    combineDropTargetForWindow(draggedWindowId, rect, groupableInfoWindows);
  const updateCombineDropTarget = (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ): void => {
    setCombineDropTarget(matchingCombineDropTarget(draggedWindowId, rect));
  };
  const updateInfoWindowDragTargets = (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ): void => {
    updateCombineDropTarget(draggedWindowId, rect);
    updateControlDockTarget(rect);
  };
  const tryGroupInfoWindow = (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ): void => {
    const targetWindowId = matchingCombineDropTarget(draggedWindowId, rect);
    setCombineDropTarget(undefined);
    if (targetWindowId === undefined) {
      return;
    }
    const targetRect =
      groupedInfoWindowIds.includes(targetWindowId) &&
      groupedInfoWindowRect !== undefined
        ? groupedInfoWindowRect
        : infoWindowRect(targetWindowId, activeFloatingWindowRects);
    updateFloatingWindowRect(infoWindowKey, targetRect);
    setInfoWindowActiveTab(draggedWindowId);
    setInfoWindowMinimized(false);
    setPreviewMinimized(false);
    setActionLogMinimized(false);
    setGroupedInfoWindowIds(
      groupedInfoWindowIdsAfterDrop({
        visibleInfoWindowIds,
        currentGroupedInfoWindowIds: groupedInfoWindowIds,
        draggedWindowId,
        targetWindowId,
      }),
    );
  };
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
  const dockInfoWindowTabs = (
    draggedWindowIds: readonly InfoWindowTabId[],
    dockRect: WindowRect,
  ): void => {
    const windowKeys = draggedWindowIds.map(infoWindowKeyForTab);
    dockFloatingWindows({
      windowKeys,
      rect: dockRect,
      replacedWindowKeys: [infoWindowKey],
    });
    setControlDockActiveTabId(windowKeys[0]);
    setInfoWindowActiveTab(
      draggedWindowIds[0] ?? groupedInfoWindowIds[0] ?? "preview",
    );
    setInfoWindowMinimized(false);
    setPreviewMinimized(false);
    setActionLogMinimized(false);
  };
  const completeInfoWindowDrag = (
    draggedWindowId: InfoWindowTabId,
    rect: WindowRect,
  ): WindowRect | undefined => {
    const dockRect = completeControlDockDrop(rect);
    if (dockRect === undefined) {
      tryGroupInfoWindow(draggedWindowId, rect);
      return undefined;
    }
    dockInfoWindowTabs([draggedWindowId], dockRect);
    setCombineDropTarget(undefined);
    return undefined;
  };
  const completeInfoGroupDrag = (rect: WindowRect): WindowRect | undefined => {
    const dockRect = completeControlDockDrop(rect);
    if (dockRect === undefined) {
      return undefined;
    }
    dockInfoWindowTabs(groupedInfoWindowIds, dockRect);
    setCombineDropTarget(undefined);
    return undefined;
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
    setCombineDropTarget(undefined);
    return undefined;
  };
  const reorderInfoWindowTabs = (
    draggedTabId: InfoWindowTabId,
    targetTabId: InfoWindowTabId,
    placement: ReorderPlacement,
  ): void => {
    setGroupedInfoWindowIds(
      moveIdNear(groupedInfoWindowIds, draggedTabId, targetTabId, placement),
    );
    setInfoWindowActiveTab(draggedTabId);
  };
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
      onDockInfoWindowGroupSplit: ({ windowKeys, rect, replacedWindowKeys }) => {
        dockFloatingWindows({
          windowKeys,
          rect,
          replacedWindowKeys,
        });
      },
    });
  useEffect(() => {
    if (
      configuredGroupedInfoWindowIds.length > 0 &&
      configuredVisibleGroupedInfoWindowIds.length < 2
    ) {
      setGroupedInfoWindowIds([]);
      setCombineDropTarget(undefined);
    }
  }, [
    configuredGroupedInfoWindowIds.length,
    configuredVisibleGroupedInfoWindowIds.length,
    setGroupedInfoWindowIds,
  ]);
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
        <section className="loading-panel">
          {lobbyState === undefined
            ? "Loading match"
            : `Waiting in lobby ${lobbyState.lobbyId}`}
        </section>
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
          onViewCollection={(title, cards) => {
            const key = collectionWindowKey(title);
            const nextOpen = renderedCollectionModal?.title !== title;
            setCollectionMinimized(false);
            setCollectionModal(nextOpen ? { title, cards } : undefined);
            updateCollectionWindowOpen(key, nextOpen);
          }}
          onBackgroundClick={() => {
            client.selectCard(undefined);
          }}
        />
      )}
      <ControlRail
        errors={client.state.errors}
        globalActions={visibleGlobalActions}
        disabled={client.state.actionInFlight}
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
          setConcedeConfirming(false);
          void client.submitAction(actionIndex);
        }}
        onNewMatch={() => {
          setConcedeConfirming(false);
          void client.createNewMatch();
        }}
        rollbackStatus={rollbackStatus}
        onCancelRollback={() => {
          void client.cancelRollback();
        }}
        onSettingsOpen={() => {
          const nextOpen = !settingsOpen;
          setSettingsOpen(nextOpen);
          updateFloatingWindowOpen(settingsWindowKey, nextOpen);
        }}
        previewControl={
          <CardPreviewToggle
            open={previewOpen}
            onToggle={togglePreviewOpen}
          />
        }
        actionLogControl={
          <ActionLogToggle
            open={actionLogOpen}
            onToggle={() => {
              const nextOpen = !actionLogOpen;
              setActionLogOpen(nextOpen);
              updateFloatingWindowOpen(actionLogWindowKey, nextOpen);
              setActionLogMinimized(false);
              setInfoWindowMinimized(false);
              if (nextOpen) {
                setInfoWindowActiveTab("log");
              }
            }}
          />
        }
        concedeDisabled={concedeDisabled}
        concedeConfirming={concedeConfirming}
        onConcede={() => {
          if (concedeAction === undefined || concedeDisabled) {
            return;
          }
          if (!concedeConfirming) {
            setConcedeConfirming(true);
            return;
          }
          setConcedeConfirming(false);
          void client.submitAction(concedeAction.index);
        }}
      />
      <DecisionModalHost
        model={
          collectionDecisionSurface === undefined ? decisionModal : undefined
        }
        disabled={client.state.actionInFlight}
        cardDisplay={cardDisplay}
        onToggleCard={client.toggleDecisionCard}
        onChooseTrigger={client.chooseDecisionTriggerValue}
        onQuantity={client.setDecisionQuantityValue}
        onOption={client.setDecisionOptionValue}
        onActionOption={client.setDecisionActionOptionValue}
        onMoveOrderedCard={client.moveDecisionCard}
        onPlacementDestination={client.setDecisionPlacementDestination}
        onConfirm={() => {
          void client.confirmDecision();
        }}
      />
      {collectionViewerDocked && collectionPresentation === "window" ? null : (
        <CollectionModalHost
          model={renderedCollectionModal}
          presentation={collectionPresentation}
          disabled={client.state.actionInFlight}
          minimized={collectionMinimized}
          initialRect={
            collectionViewerWindowKey === undefined
              ? undefined
              : (activeFloatingWindowRects[collectionViewerWindowKey] ??
                defaultCollectionWindowRect())
          }
          onToggleMinimized={() => {
            setCollectionMinimized((current) => !current);
          }}
          onRectChange={
            collectionViewerWindowKey === undefined
              ? undefined
              : (rect) => {
                  updateFloatingWindowRect(collectionViewerWindowKey, rect);
                }
          }
          onDragMove={
            collectionViewerWindowKey === undefined
              ? undefined
              : updateControlDockTarget
          }
          onDragEnd={
            collectionViewerWindowKey === undefined
              ? undefined
              : (rect) =>
                  completeDockableWindowDrag(collectionViewerWindowKey, rect)
          }
          onToggleCard={(instanceId) => {
            client.toggleDecisionCard(instanceId as InstanceId);
          }}
          onConfirm={() => {
            void client.confirmDecision();
          }}
          onPreviewCard={previewHoveredCard}
          onClose={
            cardCostCollectionModal === undefined &&
            decisionCollectionModal === undefined
              ? () => {
                  if (collectionModal !== undefined) {
                    setCollectionModal(undefined);
                  }
                  if (collectionViewerWindowKey !== undefined) {
                    updateCollectionWindowOpen(collectionViewerWindowKey, false);
                  }
                }
              : undefined
          }
        />
      )}
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
            previewHoveredCard(actionLogCardModel(card));
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
            previewHoveredCard(actionLogCardModel(card));
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
