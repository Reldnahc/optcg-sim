import type { LobbyClientState } from "../controller.js";
import { MatchLoadingPanel } from "./MatchLoadingPanel.js";
import type { MatchClientUi } from "./useMatchClient-support.js";
import { lobbyDeckStatuses } from "./useMatchClient-support.js";

export const MatchSessionLoading = ({
  client,
  firstPlayerSetup,
  lobbyState,
}: {
  client: MatchClientUi;
  firstPlayerSetup: boolean;
  lobbyState: LobbyClientState | undefined;
}): React.JSX.Element => (
  <MatchLoadingPanel
    disabled={client.state.actionInFlight}
    firstPlayerSetup={firstPlayerSetup}
    lobbyId={lobbyState?.lobbyId}
    {...lobbyDeckStatuses(lobbyState)}
    onSubmitDeckHash={client.submitLobbyDeckHash}
  />
);
