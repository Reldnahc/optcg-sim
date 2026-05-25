import { BoardLayout } from "./BoardLayout.js";
import { ControlRail } from "./ControlRail.js";
import { DecisionModalHost } from "./DecisionModalHost.js";
import { useMatchClient } from "./useMatchClient.js";

export const MatchApp = (): React.JSX.Element => {
  const client = useMatchClient();
  const { board, clientState, decisionModal, selectedCardInstanceId } =
    client.state;
  const selectedActions =
    selectedCardInstanceId === undefined
      ? []
      : client.cardActions(selectedCardInstanceId);

  return (
    <main className="match-app">
      {board === undefined ? (
        <section className="loading-panel">Loading match</section>
      ) : (
        <BoardLayout
          board={board}
          selectedCardInstanceId={selectedCardInstanceId}
          onCardClick={client.selectCard}
        />
      )}
      <ControlRail
        matchId={
          clientState === undefined ? undefined : String(clientState.matchId)
        }
        playerId={
          client.currentPlayerId === undefined
            ? undefined
            : String(client.currentPlayerId)
        }
        status={clientState?.snapshot.status}
        phase={
          clientState?.snapshot.players[clientState.seat.playerId]?.view.turn
            .phase
        }
        errors={client.state.errors}
        globalActions={client.globalActions()}
        selectedActions={selectedActions}
        selectedCardInstanceId={selectedCardInstanceId}
        disabled={client.state.actionInFlight}
        onAction={(actionIndex) => {
          void client.submitAction(actionIndex);
        }}
        onNewMatch={() => {
          void client.createNewMatch();
        }}
        onRefresh={() => {
          void client.refresh();
        }}
      />
      <DecisionModalHost
        model={decisionModal}
        disabled={client.state.actionInFlight}
        onToggleCard={client.toggleDecisionCard}
        onQuantity={client.setDecisionQuantityValue}
        onConfirm={() => {
          void client.confirmDecision();
        }}
      />
    </main>
  );
};
