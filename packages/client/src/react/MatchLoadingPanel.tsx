import type { MatchClientSessionState } from "../controller.js";
import {
  isFirstPlayerSetupClientState,
  isLobbyClientState,
} from "./useMatchClient-support.js";

export interface MatchLoadingPanelProps {
  clientState: MatchClientSessionState | undefined;
}

export const MatchLoadingPanel = ({
  clientState,
}: MatchLoadingPanelProps): React.JSX.Element => {
  const firstPlayerSetup =
    clientState !== undefined && isFirstPlayerSetupClientState(clientState);
  const lobbyId =
    clientState !== undefined && isLobbyClientState(clientState)
      ? clientState.lobbyId
      : undefined;

  return (
    <section className="loading-panel">
      <h1>
        {firstPlayerSetup
          ? "Waiting for first-player setup"
          : lobbyId === undefined
            ? "Loading match"
            : `Waiting in lobby ${lobbyId}`}
      </h1>
    </section>
  );
};
