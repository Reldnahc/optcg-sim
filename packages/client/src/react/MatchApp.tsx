import { useCallback, useEffect, useMemo, useState } from "react";

import type { InstanceId } from "@optcg/types";

import { createActionLogEntries } from "../action-log.js";
import {
  createCollectionDecisionSurface,
  usesCollectionCardCostSurface,
} from "../interactions/decision-surface.js";
import type { ClientCardModel } from "../view-model.js";
import { ActionLogToggle } from "./ActionLogToggle.js";
import {
  ActionLogWindow,
  defaultActionLogWindowRect,
} from "./ActionLogWindow.js";
import { BoardLayout } from "./BoardLayout.js";
import { createBrowserPersistentStorage } from "./browser-storage.js";
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
import type { CollectionModalModel } from "./CollectionModalHost.js";
import { CollectionModalHost } from "./CollectionModalHost.js";
import {
  collectionModalFromWindowKey,
  collectionWindowKey,
} from "./collection-window-model.js";
import { ControlRail } from "./ControlRail.js";
import { DecisionModalHost } from "./DecisionModalHost.js";
import { moveIdNear } from "./drag-reorder.js";
import type { ReorderPlacement } from "./drag-reorder.js";
import type { WindowRect } from "./FloatingWindow.js";
import {
  combineDropTargetForWindow,
  splitWindowRectFromPoint,
} from "./floating-window-grouping.js";
import type { GroupableWindow } from "./floating-window-grouping.js";
import { orderCardsByInstanceIds } from "./hand-order-model.js";
import { InfoTabbedWindow } from "./InfoTabbedWindow.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";
import {
  actionLogWindowKey,
  cardPreviewWindowKey,
  groupedInfoWindowIds as groupedInfoWindowIdsFromState,
  groupedInfoWindowIdsAfterDrop,
  groupedInfoWindowIdsAfterTabDragOut,
  infoWindowDefaultSize,
  infoWindowKey,
  infoWindowKeyForTab,
  infoWindowRect,
  settingsWindowKey,
  standaloneInfoWindowIds as standaloneInfoWindowIdsFromState,
  visibleInfoWindowIds as visibleInfoWindowIdsFromState,
} from "./info-window-model.js";
import { RevealWindowHost } from "./RevealWindowHost.js";
import { opponentRevealsFromEvents } from "./reveal-viewer.js";
import { rollbackStatusForPlayer } from "./rollback-status.js";
import { defaultSettingsWindowRect, SettingsWindow } from "./SettingsWindow.js";
import { sourceZoneCards } from "./source-zone-cards.js";
import type { TabDragOutPoint } from "./TabbedFloatingWindow.js";
import { useInfoWindowConfig } from "./use-info-window-config.js";
import { useMatchClient } from "./useMatchClient.js";
import { usePoppedOutWindowDrag } from "./use-popped-out-window-drag.js";
import {
  emptyFloatingWindowRectState,
  emptyRevealWindowState,
  type FloatingWindowRectState,
  type RevealWindowState,
} from "./window-state-model.js";
import type { RevealWindowStateStore } from "./window-state-store.js";
import { createRevealWindowStateStore } from "./window-state-store.js";

const revealWindowKey = (revealId: string): string => `reveal:${revealId}`;

export const MatchApp = (): React.JSX.Element => {
  const client = useMatchClient();
  const [collectionModal, setCollectionModal] = useState<
    CollectionModalModel | undefined
  >(undefined);
  const [collectionMinimized, setCollectionMinimized] = useState(false);
  const [revealWindowState, setRevealWindowState] = useState<RevealWindowState>(
    () => emptyRevealWindowState,
  );
  const [floatingWindowRects, setFloatingWindowRects] =
    useState<FloatingWindowRectState>(() => emptyFloatingWindowRectState);
  const [previewCard, setPreviewCard] = useState<ClientCardModel | undefined>(
    undefined,
  );
  const [lastPreviewCard, setLastPreviewCard] = useState<
    ClientCardModel | undefined
  >(undefined);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [previewMinimized, setPreviewMinimized] = useState(false);
  const [actionLogOpen, setActionLogOpen] = useState(false);
  const [actionLogMinimized, setActionLogMinimized] = useState(false);
  const [infoWindowMinimized, setInfoWindowMinimized] = useState(false);
  const [combineDropTarget, setCombineDropTarget] = useState<
    InfoWindowTabId | undefined
  >(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [handOrders, setHandOrders] = useState<Record<string, string[]>>({});
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
    activeTabId: infoWindowActiveTab,
    groupedTabIds: configuredGroupedInfoWindowIds,
    load: loadInfoWindowConfig,
    reset: resetInfoWindowConfig,
    setActiveTab: setInfoWindowActiveTab,
    setGroupedTabIds: setGroupedInfoWindowIds,
  } = useInfoWindowConfig(revealWindowStateStore);
  useEffect(() => {
    if (matchScope === undefined || revealWindowStateStore === undefined) {
      setRevealWindowState(emptyRevealWindowState);
      setFloatingWindowRects(emptyFloatingWindowRectState);
      resetInfoWindowConfig();
      return;
    }
    setRevealWindowState({
      scope: matchScope,
      dismissed: revealWindowStateStore.loadDismissedRevealIds(),
      minimized: revealWindowStateStore.loadMinimizedRevealIds(),
    });
    setFloatingWindowRects({
      scope: matchScope,
      rects: revealWindowStateStore.loadWindowRects(),
      openWindowIds: revealWindowStateStore.loadOpenWindowIds(),
    });
    loadInfoWindowConfig();
  }, [
    loadInfoWindowConfig,
    matchScope,
    resetInfoWindowConfig,
    revealWindowStateStore,
  ]);
  const updateRevealWindowState = (
    update: (state: RevealWindowState) => RevealWindowState,
  ): void => {
    if (matchScope === undefined) {
      return;
    }
    setRevealWindowState((current) => {
      const base =
        current.scope === matchScope ? current : emptyRevealWindowState;
      const next = update({
        scope: matchScope,
        dismissed: new Set(base.dismissed),
        minimized: new Set(base.minimized),
      });
      revealWindowStateStore?.saveDismissedRevealIds(next.dismissed);
      revealWindowStateStore?.saveMinimizedRevealIds(next.minimized);
      return next;
    });
  };
  const lobbyState =
    clientState !== undefined && "lobbyId" in clientState
      ? clientState
      : undefined;
  const currentPlayerId = client.currentPlayerId;
  const activeFloatingWindowRects =
    matchScope !== undefined && floatingWindowRects.scope === matchScope
      ? floatingWindowRects.rects
      : {};
  const activeOpenWindowIds =
    matchScope !== undefined && floatingWindowRects.scope === matchScope
      ? floatingWindowRects.openWindowIds
      : new Set<string>();
  const updateFloatingWindowRect = (key: string, rect: WindowRect): void => {
    if (matchScope === undefined) {
      return;
    }
    setFloatingWindowRects((current) => {
      const base =
        current.scope === matchScope
          ? current
          : { scope: matchScope, rects: {}, openWindowIds: new Set<string>() };
      const next = {
        scope: matchScope,
        rects: { ...base.rects, [key]: rect },
        openWindowIds: new Set(base.openWindowIds),
      };
      revealWindowStateStore?.saveWindowRects(next.rects);
      return next;
    });
  };
  const updateFloatingWindowOpen = (key: string, open: boolean): void => {
    if (matchScope === undefined) {
      return;
    }
    setFloatingWindowRects((current) => {
      const base =
        current.scope === matchScope
          ? current
          : { scope: matchScope, rects: {}, openWindowIds: new Set<string>() };
      const openWindowIds = new Set(base.openWindowIds);
      if (open) {
        openWindowIds.add(key);
      } else {
        openWindowIds.delete(key);
      }
      const next = {
        scope: matchScope,
        rects: base.rects,
        openWindowIds,
      };
      revealWindowStateStore?.saveOpenWindowIds(openWindowIds);
      return next;
    });
  };
  const updateCollectionWindowOpen = (key: string, open: boolean): void => {
    if (matchScope === undefined) {
      return;
    }
    setFloatingWindowRects((current) => {
      const base =
        current.scope === matchScope
          ? current
          : { scope: matchScope, rects: {}, openWindowIds: new Set<string>() };
      const openWindowIds = new Set(
        [...base.openWindowIds].filter(
          (windowId) => !windowId.startsWith("collection:"),
        ),
      );
      if (open) {
        openWindowIds.add(key);
      }
      const next = {
        scope: matchScope,
        rects: base.rects,
        openWindowIds,
      };
      revealWindowStateStore?.saveOpenWindowIds(openWindowIds);
      return next;
    });
  };
  const startPoppedOutDrag = usePoppedOutWindowDrag({
    onRectChange: updateFloatingWindowRect,
  });
  const handOrderKey = `${matchScope ?? "local"}:${String(
    currentPlayerId ?? "unknown",
  )}`;
  const displayBoard = useMemo(() => {
    if (board === undefined) {
      return undefined;
    }
    return {
      ...board,
      self: {
        ...board.self,
        hand: orderCardsByInstanceIds(
          board.self.hand,
          handOrders[handOrderKey] ?? [],
        ),
      },
    };
  }, [board, handOrderKey, handOrders]);
  const moveHandCard = useCallback(
    (
      draggedInstanceId: string,
      targetInstanceId: string,
      placement: ReorderPlacement,
    ): void => {
      if (board === undefined) {
        return;
      }
      setHandOrders((current) => {
        const currentOrder = orderCardsByInstanceIds(
          board.self.hand,
          current[handOrderKey] ?? [],
        ).map((card) => String(card.instanceId));
        return {
          ...current,
          [handOrderKey]: moveIdNear(
            currentOrder,
            draggedInstanceId,
            targetInstanceId,
            placement,
          ),
        };
      });
    },
    [board, handOrderKey],
  );
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
    setLastPreviewCard(card);
    if (!previewEnabled) {
      return;
    }
    setPreviewCard(card);
    setInfoWindowActiveTab("preview");
    setInfoWindowMinimized(false);
  };
  useEffect(() => {
    if (previewEnabled) {
      return;
    }
    setPreviewCard(undefined);
    setPreviewMinimized(false);
  }, [previewEnabled]);
  const togglePreviewEnabled = (): void => {
    setPreviewEnabled((current) => {
      const next = !current;
      if (next) {
        setPreviewCard(lastPreviewCard);
        setPreviewMinimized(false);
      }
      return next;
    });
  };
  const closeCardPreview = (): void => {
    setPreviewEnabled(false);
    setPreviewCard(undefined);
    setPreviewMinimized(false);
    setInfoWindowActiveTab("log");
    setGroupedInfoWindowIds(
      groupedInfoWindowIdsAfterTabDragOut(
        configuredGroupedInfoWindowIds,
        "preview",
      ),
    );
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
  const collectionPresentation =
    collectionViewerKey === undefined ? "modal" : "window";
  useEffect(() => {
    setCollectionMinimized(false);
  }, [renderedCollectionKey]);
  const activeRevealWindowState =
    matchScope !== undefined && revealWindowState.scope === matchScope
      ? revealWindowState
      : emptyRevealWindowState;
  const opponentReveals =
    currentPlayerId === undefined ||
    playerSnapshot === undefined ||
    matchScope === undefined ||
    revealWindowState.scope !== matchScope
      ? []
      : opponentRevealsFromEvents(
          playerSnapshot.view.events,
          currentPlayerId,
          activeRevealWindowState.dismissed,
        );
  const opponentRevealWindows = opponentReveals.map((reveal, index) => ({
    revealId: reveal.revealId,
    initialRect: {
      x: 380 + index * 24,
      y: 100 + index * 24,
      width: 300,
      height: 420,
    },
    model: {
      title: reveal.title,
      cards: reveal.cards.map((card) => cardModel(card)),
    },
  }));
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
  const showPreviewWindow = previewCard !== undefined;
  const showActionLogWindow = actionLogOpen;
  const showSettingsWindow = settingsOpen;
  const visibleInfoWindowIds = visibleInfoWindowIdsFromState({
    showPreviewWindow,
    showActionLogWindow,
    showSettingsWindow,
  });
  const configuredVisibleGroupedInfoWindowIds = groupedInfoWindowIdsFromState(
    visibleInfoWindowIds,
    configuredGroupedInfoWindowIds,
  );
  const groupedInfoWindowIds =
    configuredVisibleGroupedInfoWindowIds.length >= 2
      ? configuredVisibleGroupedInfoWindowIds
      : [];
  const standaloneInfoWindowIds = standaloneInfoWindowIdsFromState(
    visibleInfoWindowIds,
    groupedInfoWindowIds,
  );
  const showTabbedInfoWindow = groupedInfoWindowIds.length >= 2;
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
  const splitInfoWindowTab = (
    tabId: InfoWindowTabId,
    point: TabDragOutPoint,
  ): void => {
    const windowKey = infoWindowKeyForTab(tabId);
    const remainingGroupedWindowIds = groupedInfoWindowIdsAfterTabDragOut(
      groupedInfoWindowIds,
      tabId,
    );
    const remainingWindowId =
      remainingGroupedWindowIds[0] ??
      groupedInfoWindowIds.find((windowId) => windowId !== tabId);
    const groupRect =
      activeFloatingWindowRects[infoWindowKey] ??
      infoWindowRect(tabId, activeFloatingWindowRects);
    if (
      remainingGroupedWindowIds.length === 0 &&
      remainingWindowId !== undefined
    ) {
      updateFloatingWindowRect(
        infoWindowKeyForTab(remainingWindowId),
        groupRect,
      );
    }
    const poppedOutSize = infoWindowDefaultSize(tabId);
    const poppedOutRect = splitWindowRectFromPoint(point, poppedOutSize);
    updateFloatingWindowRect(windowKey, poppedOutRect);
    startPoppedOutDrag({
      pointerId: point.pointerId,
      windowKey,
      offsetX: poppedOutSize.width / 2,
      offsetY: 20,
      width: poppedOutSize.width,
      height: poppedOutSize.height,
    });
    setGroupedInfoWindowIds(remainingGroupedWindowIds);
    setInfoWindowMinimized(false);
    setInfoWindowActiveTab(remainingWindowId ?? tabId);
    if (tabId === "log") {
      setActionLogOpen(true);
      updateFloatingWindowOpen(actionLogWindowKey, true);
    }
    if (tabId === "settings") {
      setSettingsOpen(true);
      updateFloatingWindowOpen(settingsWindowKey, true);
    }
  };
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
    const nextActionLogOpen = activeOpenWindowIds.has(actionLogWindowKey);
    const nextSettingsOpen = activeOpenWindowIds.has(settingsWindowKey);
    setActionLogOpen(nextActionLogOpen);
    setSettingsOpen(nextSettingsOpen);
    if (nextActionLogOpen && previewCard === undefined) {
      setInfoWindowActiveTab("log");
    }
  }, [activeOpenWindowIds, floatingWindowRects.scope, matchScope, previewCard]);
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
            enabled={previewEnabled}
            onToggle={togglePreviewEnabled}
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
      <CollectionModalHost
        model={renderedCollectionModal}
        presentation={collectionPresentation}
        disabled={client.state.actionInFlight}
        minimized={collectionMinimized}
        initialRect={
          collectionViewerWindowKey === undefined
            ? undefined
            : activeFloatingWindowRects[collectionViewerWindowKey]
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
      {opponentRevealWindows.map((revealWindow) => (
        <RevealWindowHost
          key={revealWindow.revealId}
          model={revealWindow.model}
          initialRect={
            activeFloatingWindowRects[revealWindowKey(revealWindow.revealId)] ??
            revealWindow.initialRect
          }
          minimized={activeRevealWindowState.minimized.has(
            revealWindow.revealId,
          )}
          onToggleMinimized={() => {
            updateRevealWindowState((state) => {
              if (state.minimized.has(revealWindow.revealId)) {
                state.minimized.delete(revealWindow.revealId);
              } else {
                state.minimized.add(revealWindow.revealId);
              }
              return state;
            });
          }}
          onPreviewCard={previewHoveredCard}
          onClose={() => {
            updateRevealWindowState((state) => {
              state.dismissed.add(revealWindow.revealId);
              state.minimized.delete(revealWindow.revealId);
              return state;
            });
          }}
          onRectChange={(rect) => {
            updateFloatingWindowRect(
              revealWindowKey(revealWindow.revealId),
              rect,
            );
          }}
        />
      ))}
      {showTabbedInfoWindow ? (
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
          onTabDragOut={splitInfoWindowTab}
          onRequestRollback={(rollbackPointId) => {
            void client.requestRollback(rollbackPointId);
          }}
          onPreviewCard={(card) => {
            previewHoveredCard(actionLogCardModel(card));
          }}
        />
      ) : null}
      {standaloneInfoWindowIds.includes("log") ? (
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
          onClose={() => {
            setActionLogOpen(false);
            setActionLogMinimized(false);
            setInfoWindowActiveTab("preview");
            setGroupedInfoWindowIds(
              groupedInfoWindowIdsAfterTabDragOut(groupedInfoWindowIds, "log"),
            );
            updateFloatingWindowOpen(actionLogWindowKey, false);
          }}
          onRectChange={(rect) => {
            updateFloatingWindowRect(actionLogWindowKey, rect);
          }}
          onDragMove={(rect) => {
            updateCombineDropTarget("log", rect);
          }}
          onDragEnd={(rect) => {
            tryGroupInfoWindow("log", rect);
          }}
          onRequestRollback={(rollbackPointId) => {
            void client.requestRollback(rollbackPointId);
          }}
          onPreviewCard={(card) => {
            previewHoveredCard(actionLogCardModel(card));
          }}
        />
      ) : null}
      {standaloneInfoWindowIds.includes("preview") ? (
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
            updateCombineDropTarget("preview", rect);
          }}
          onDragEnd={(rect) => {
            tryGroupInfoWindow("preview", rect);
          }}
        />
      ) : null}
      {standaloneInfoWindowIds.includes("settings") ? (
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
          onClose={() => {
            setSettingsOpen(false);
            setInfoWindowActiveTab("preview");
            setGroupedInfoWindowIds(
              groupedInfoWindowIdsAfterTabDragOut(
                groupedInfoWindowIds,
                "settings",
              ),
            );
            updateFloatingWindowOpen(settingsWindowKey, false);
          }}
          onRectChange={(rect) => {
            updateFloatingWindowRect(settingsWindowKey, rect);
          }}
          onDragMove={(rect) => {
            updateCombineDropTarget("settings", rect);
          }}
          onDragEnd={(rect) => {
            tryGroupInfoWindow("settings", rect);
          }}
        />
      ) : null}
    </main>
  );
};
