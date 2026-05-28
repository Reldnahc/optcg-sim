import { useEffect, useMemo, useState } from "react";

import type { CardRef, InstanceId } from "@optcg/types";

import {
  createCollectionDecisionSurface,
  usesCollectionCardCostSurface,
} from "../interactions/decision-surface.js";
import type { BoardViewModel, ClientCardModel } from "../view-model.js";
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
  const lobbyState =
    clientState !== undefined && "lobbyId" in clientState
      ? clientState
      : undefined;
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
        model={
          cardCostCollectionModal ?? decisionCollectionModal ?? collectionModal
        }
        disabled={client.state.actionInFlight}
        onToggleCard={(instanceId) => {
          client.toggleDecisionCard(instanceId as InstanceId);
        }}
        onConfirm={() => {
          void client.confirmDecision();
        }}
        onClose={
          cardCostCollectionModal === undefined &&
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
