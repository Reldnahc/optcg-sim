import { useState } from "react";

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
        model={decisionModal}
        disabled={client.state.actionInFlight}
        onToggleCard={client.toggleDecisionCard}
        onQuantity={client.setDecisionQuantityValue}
        onOption={client.setDecisionOptionValue}
        onActionOption={client.setDecisionActionOptionValue}
        onConfirm={() => {
          void client.confirmDecision();
        }}
      />
      <CollectionModalHost
        model={collectionModal}
        onClose={() => {
          setCollectionModal(undefined);
        }}
      />
    </main>
  );
};
