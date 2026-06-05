import type { MatchClientSessionState } from "../controller.js";
import type { ReactNode } from "react";
import {
  isFirstPlayerSetupClientState,
  isLobbyClientState,
} from "./useMatchClient-support.js";

export interface MatchLoadingPanelProps {
  clientState: MatchClientSessionState | undefined;
  lobbyDeckPanel?: ReactNode | undefined;
}

export const MatchLoadingPanel = ({
  clientState,
  lobbyDeckPanel,
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
      {lobbyId === undefined ? null : lobbyDeckPanel}
    </section>
  );
};
