import { useCallback, useEffect, useMemo, useState } from "react";

import type { CardRef, InstanceId } from "@optcg/types";

import {
  createActionLogEntries,
  type ActionLogCardMention,
} from "../action-log.js";
import {
  createCollectionDecisionSurface,
  usesCollectionCardCostSurface,
} from "../interactions/decision-surface.js";
import type { BoardViewModel, ClientCardModel } from "../view-model.js";
import { ActionLogToggle } from "./ActionLogToggle.js";
import { ActionLogWindow } from "./ActionLogWindow.js";
import { BoardLayout } from "./BoardLayout.js";
import { createBrowserPersistentStorage } from "./browser-storage.js";
import { CardPreviewToggle } from "./CardPreviewToggle.js";
import { CardPreviewWindow } from "./CardPreviewWindow.js";
import type { CollectionModalModel } from "./CollectionModalHost.js";
import { CollectionModalHost } from "./CollectionModalHost.js";
import { ControlRail } from "./ControlRail.js";
import { DecisionModalHost } from "./DecisionModalHost.js";
import { moveIdNear } from "./drag-reorder.js";
import type { ReorderPlacement } from "./drag-reorder.js";
import type { WindowRect } from "./FloatingWindow.js";
import { RevealWindowHost } from "./RevealWindowHost.js";
import { opponentRevealsFromEvents } from "./reveal-viewer.js";
import { useMatchClient } from "./useMatchClient.js";
import type { RevealWindowStateStore } from "./window-state-store.js";
import { createRevealWindowStateStore } from "./window-state-store.js";

interface RevealWindowState {
  scope?: string | undefined;
  dismissed: Set<string>;
  minimized: Set<string>;
}

interface FloatingWindowRectState {
  scope?: string | undefined;
  rects: Record<string, WindowRect>;
  openWindowIds: Set<string>;
}

const emptyRevealWindowState: RevealWindowState = {
  dismissed: new Set(),
  minimized: new Set(),
};

const emptyFloatingWindowRectState: FloatingWindowRectState = {
  rects: {},
  openWindowIds: new Set(),
};

const cardPreviewWindowKey = "card-preview";
const actionLogWindowKey = "action-log";
const collectionWindowKey = (title: string): string => `collection:${title}`;
const revealWindowKey = (revealId: string): string => `reveal:${revealId}`;

const collectionModalFromWindowKey = (
  key: string,
  board: BoardViewModel,
): CollectionModalModel | undefined => {
  switch (key) {
    case "collection:Player trash":
      return { title: "Player trash", cards: board.self.trash };
    case "collection:Opponent trash":
      return { title: "Opponent trash", cards: board.opponent.trash };
    default:
      return undefined;
  }
};

const orderCardsByInstanceIds = (
  cards: readonly ClientCardModel[],
  order: readonly string[] = [],
): ClientCardModel[] => {
  const cardsById = new Map(
    cards.map((card) => [String(card.instanceId), card]),
  );
  const orderedCards = order.flatMap((instanceId) => {
    const card = cardsById.get(instanceId);
    return card === undefined ? [] : [card];
  });
  const orderedIds = new Set(
    orderedCards.map((card) => String(card.instanceId)),
  );
  return [
    ...orderedCards,
    ...cards.filter((card) => !orderedIds.has(String(card.instanceId))),
  ];
};

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
  useEffect(() => {
    if (matchScope === undefined || revealWindowStateStore === undefined) {
      setRevealWindowState(emptyRevealWindowState);
      setFloatingWindowRects(emptyFloatingWindowRectState);
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
  }, [matchScope, revealWindowStateStore]);
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
  const pendingRollbackRequest = matchState?.snapshot.rollback?.pendingRequest;
  const rollbackStatus =
    pendingRollbackRequest === undefined || currentPlayerId === undefined
      ? undefined
      : pendingRollbackRequest.requestedBy === currentPlayerId
        ? {
            message: "Rollback requested. Waiting for opponent.",
            canCancel: true,
          }
        : pendingRollbackRequest.approvingPlayerId === currentPlayerId
          ? {
              message: "Opponent requested a rollback.",
              canCancel: false,
            }
          : undefined;
  useEffect(() => {
    if (concedeDisabled) {
      setConcedeConfirming(false);
    }
  }, [concedeDisabled]);
  const cardDisplay = (card: CardRef): { name: string; imageUrl?: string } => {
    const catalogEntry =
      matchState?.cards.players[card.playerId]?.cards[card.cardId];
    if (catalogEntry === undefined) {
      return { name: String(card.cardId) };
    }
    return {
      name: catalogEntry.name,
      ...(catalogEntry.imageUrl === undefined
        ? {}
        : { imageUrl: catalogEntry.imageUrl }),
    };
  };
  const cardModel = (card: CardRef): ClientCardModel => {
    const catalogEntry =
      matchState?.cards.players[card.playerId]?.cards[card.cardId];
    return {
      instanceId: card.instanceId,
      cardId: card.cardId,
      name: catalogEntry?.name ?? String(card.cardId),
      category: catalogEntry?.category ?? "unknown",
      ...(catalogEntry?.effectText === undefined
        ? {}
        : { effectText: catalogEntry.effectText }),
      ...(catalogEntry?.triggerText === undefined
        ? {}
        : { triggerText: catalogEntry.triggerText }),
      ...(catalogEntry?.imageUrl === undefined
        ? {}
        : { imageUrl: catalogEntry.imageUrl }),
      attachedDonCount: 0,
      attachedDonCards: [],
    };
  };
  const actionLogCardModel = (
    card: ActionLogCardMention["card"],
  ): ClientCardModel => ({
    instanceId:
      card.instanceId ??
      (`action-log:${card.playerId}:${card.cardId}` as InstanceId),
    cardId: card.cardId,
    name: card.name,
    category: card.category,
    ...(card.effectText === undefined ? {} : { effectText: card.effectText }),
    ...(card.triggerText === undefined
      ? {}
      : { triggerText: card.triggerText }),
    ...(card.imageUrl === undefined ? {} : { imageUrl: card.imageUrl }),
    attachedDonCount: 0,
    attachedDonCards: [],
  });
  const previewHoveredCard = (card: ClientCardModel): void => {
    setLastPreviewCard(card);
    if (!previewEnabled) {
      return;
    }
    setPreviewCard(card);
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
  useEffect(() => {
    if (matchScope === undefined || floatingWindowRects.scope !== matchScope) {
      return;
    }
    setActionLogOpen(activeOpenWindowIds.has(actionLogWindowKey));
  }, [activeOpenWindowIds, floatingWindowRects.scope, matchScope]);
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
      {actionLogOpen ? (
        <ActionLogWindow
          entries={actionLogEntries}
          minimized={actionLogMinimized}
          initialRect={activeFloatingWindowRects[actionLogWindowKey]}
          onToggleMinimized={() => {
            setActionLogMinimized((current) => !current);
          }}
          onClose={() => {
            setActionLogOpen(false);
            setActionLogMinimized(false);
            updateFloatingWindowOpen(actionLogWindowKey, false);
          }}
          onRectChange={(rect) => {
            updateFloatingWindowRect(actionLogWindowKey, rect);
          }}
          onRequestRollback={(rollbackPointId) => {
            void client.requestRollback(rollbackPointId);
          }}
          onPreviewCard={(card) => {
            previewHoveredCard(actionLogCardModel(card));
          }}
        />
      ) : null}
      <CardPreviewWindow
        card={previewCard}
        minimized={previewMinimized}
        initialRect={activeFloatingWindowRects[cardPreviewWindowKey]}
        onToggleMinimized={() => {
          setPreviewMinimized((current) => !current);
        }}
        onClose={closeCardPreview}
        onRectChange={(rect) => {
          updateFloatingWindowRect(cardPreviewWindowKey, rect);
        }}
      />
    </main>
  );
};

const sourceZoneCards = (
  board: BoardViewModel,
  source: NonNullable<
    NonNullable<ReturnType<typeof useMatchClient>["state"]["cardCostSelection"]>
  >["source"],
): readonly ClientCardModel[] => {
  if (source === undefined) {
    return [];
  }
  const selfSource =
    source.playerId === undefined || source.playerId === board.playerId;
  const zones = selfSource ? board.self : board.opponent;
  switch (source.zone) {
    case "characterArea":
      return zones.characters;
    case "costArea":
      return zones.costArea;
    case "hand":
      return selfSource ? board.self.hand : [];
    case "leaderArea":
      return [zones.leader];
    case "stageArea":
      return zones.stage === undefined ? [] : [zones.stage];
    case "trash":
      return zones.trash;
    case "deck":
    case "donDeck":
    case "life":
    case "noZone":
      return [];
  }
};
