import { BoardLayout } from "./BoardLayout.js";
import { ControlRail } from "./ControlRail.js";
import { DecisionModalHost } from "./DecisionModalHost.js";
import { useMatchClient } from "./useMatchClient.js";

export const MatchApp = (): React.JSX.Element => {
  const client = useMatchClient();
  const { board, clientState, decisionModal, selectedCardInstanceId } =
    client.state;
  const matchState =
    clientState !== undefined && "matchId" in clientState
      ? clientState
      : undefined;
  const lobbyState =
    clientState !== undefined && "lobbyId" in clientState
      ? clientState
      : undefined;
  const selectedActions =
    selectedCardInstanceId === undefined
      ? []
      : client.cardActions(selectedCardInstanceId);
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
          onCardClick={client.selectCard}
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
        onOption={client.setDecisionOptionValue}
        onConfirm={() => {
          void client.confirmDecision();
        }}
      />
    </main>
  );
};
