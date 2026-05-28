import { useEffect, useMemo, useState } from "react";

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

const emptyRevealWindowState: RevealWindowState = {
  dismissed: new Set(),
  minimized: new Set(),
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
  const {
    board,
    cardCostSelection,
    clientState,
    decisionModal,
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
      return;
    }
    setRevealWindowState({
      scope: matchScope,
      dismissed: revealWindowStateStore.loadDismissedRevealIds(),
      minimized: revealWindowStateStore.loadMinimizedRevealIds(),
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
  const renderedCollectionModal =
    cardCostCollectionModal ?? decisionCollectionModal ?? collectionModal;
  const renderedCollectionKey = renderedCollectionModal?.title;
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
      title: "Opponent revealed",
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

  return (
    <main className="match-app">
      {board === undefined ? (
        <section className="loading-panel">
          {lobbyState === undefined
            ? "Loading match"
            : `Waiting in lobby ${lobbyState.lobbyId}`}
        </section>
      ) : (
        <BoardLayout
          board={board}
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
          onViewCollection={(title, cards) => {
            setCollectionModal((current) => {
              if (current?.title === title) {
                return undefined;
              }
              setCollectionMinimized(false);
              return { title, cards };
            });
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
              setActionLogOpen((current) => !current);
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
        onToggleBottomPlacement={client.toggleDecisionCardBottomPlacement}
        onConfirm={() => {
          void client.confirmDecision();
        }}
      />
      <CollectionModalHost
        model={renderedCollectionModal}
        disabled={client.state.actionInFlight}
        minimized={collectionMinimized}
        onToggleMinimized={() => {
          setCollectionMinimized((current) => !current);
        }}
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
              }
            : undefined
        }
      />
      {opponentRevealWindows.map((revealWindow) => (
        <RevealWindowHost
          key={revealWindow.revealId}
          model={revealWindow.model}
          initialRect={revealWindow.initialRect}
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
        />
      ))}
      {actionLogOpen ? (
        <ActionLogWindow
          entries={actionLogEntries}
          minimized={actionLogMinimized}
          onToggleMinimized={() => {
            setActionLogMinimized((current) => !current);
          }}
          onClose={() => {
            setActionLogOpen(false);
            setActionLogMinimized(false);
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
        onToggleMinimized={() => {
          setPreviewMinimized((current) => !current);
        }}
        onClose={closeCardPreview}
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
