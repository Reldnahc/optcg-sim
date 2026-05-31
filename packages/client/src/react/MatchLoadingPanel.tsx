export interface MatchLoadingPanelProps {
  firstPlayerSetup: boolean;
  lobbyId?: string | undefined;
}

export const MatchLoadingPanel = ({
  firstPlayerSetup,
  lobbyId,
}: MatchLoadingPanelProps): React.JSX.Element => (
  <section className="loading-panel">
    {firstPlayerSetup
      ? "Waiting for first-player setup"
      : lobbyId === undefined
        ? "Loading match"
        : `Waiting in lobby ${lobbyId}`}
  </section>
);
