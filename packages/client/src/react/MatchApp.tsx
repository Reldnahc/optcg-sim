import { useState } from "react";

import type { CardRef, InstanceId } from "@optcg/types";

import { createCollectionDecisionSurface } from "../interactions/decision-surface.js";
import type { ClientCardModel } from "../view-model.js";
import { BoardLayout } from "./BoardLayout.js";
import type { CollectionModalModel } from "./CollectionModalHost.js";
import { CollectionModalHost } from "./CollectionModalHost.js";
import { ControlRail } from "./ControlRail.js";
import { DecisionModalHost } from "./DecisionModalHost.js";
import { useMatchClient } from "./useMatchClient.js";

export const MatchApp = (): React.JSX.Element => {
  const client = useMatchClient();
  const [collectionModal, setCollectionModal] = useState<
    CollectionModalModel | undefined
  >(undefined);
  const {
    board,
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
  const lobbyState =
    clientState !== undefined && "lobbyId" in clientState
      ? clientState
      : undefined;
  const globalActions =
    decisionModal === undefined ? client.globalActions() : [];
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
          onViewCollection={(title, cards) => {
            setCollectionModal({ title, cards });
          }}
          onBackgroundClick={() => {
            client.selectCard(undefined);
          }}
        />
      )}
      <ControlRail
        lobbyId={lobbyState === undefined ? undefined : lobbyState.lobbyId}
        matchId={
          matchState === undefined ? undefined : String(matchState.matchId)
        }
        playerId={
          client.currentPlayerId === undefined
            ? undefined
            : String(client.currentPlayerId)
        }
        status={matchState?.snapshot.status}
        phase={
          matchState?.snapshot.players[matchState.seat.playerId]?.view.turn
            .phase
        }
        errors={client.state.errors}
        globalActions={globalActions}
        disabled={client.state.actionInFlight}
        onAction={(actionIndex) => {
          void client.submitAction(actionIndex);
        }}
        onNewMatch={() => {
          void client.createNewMatch();
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
        onConfirm={() => {
          void client.confirmDecision();
        }}
      />
      <CollectionModalHost
        model={decisionCollectionModal ?? collectionModal}
        disabled={client.state.actionInFlight}
        onToggleCard={(instanceId) => {
          client.toggleDecisionCard(instanceId as InstanceId);
        }}
        onConfirm={() => {
          void client.confirmDecision();
        }}
        onClose={
          decisionCollectionModal === undefined
            ? () => {
                setCollectionModal(undefined);
              }
            : undefined
        }
      />
    </main>
  );
};
