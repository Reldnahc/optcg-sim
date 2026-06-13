import { useEffect, type Dispatch, type SetStateAction } from "react";

import type {
  MatchClientController,
  MatchClientSessionState,
} from "../controller.js";
import type { MatchRematchRequestMessage } from "../transport.js";
import {
  isFirstPlayerSetupClientState,
  isLobbyClientState,
  isMatchClientState,
  setLobbyLocation,
  setMatchLocation,
} from "./useMatchClient-support.js";

interface UseMatchLiveConnectionsInput {
  controller: MatchClientController;
  liveConnectionKey: string | undefined;
  lobbyConnectionKey: string | undefined;
  setClientState: Dispatch<SetStateAction<MatchClientSessionState | undefined>>;
  setRematchRequestedBy: Dispatch<
    SetStateAction<MatchRematchRequestMessage["requestedBy"] | undefined>
  >;
  setErrors: Dispatch<SetStateAction<string[]>>;
}

export const useMatchLiveConnections = ({
  controller,
  liveConnectionKey,
  lobbyConnectionKey,
  setClientState,
  setRematchRequestedBy,
  setErrors,
}: UseMatchLiveConnectionsInput): void => {
  useEffect(() => {
    if (liveConnectionKey === undefined) {
      controller.disconnectLive();
      return;
    }
    controller.connectLive({
      onState(nextState) {
        if (
          isMatchClientState(nextState) ||
          isFirstPlayerSetupClientState(nextState)
        ) {
          setMatchLocation(nextState.matchId);
        } else if (isLobbyClientState(nextState)) {
          setLobbyLocation(nextState);
        }
        setClientState(nextState);
        if (isLobbyClientState(nextState)) {
          setRematchRequestedBy(undefined);
        }
        setErrors([]);
      },
      onRematchRequest(message) {
        setRematchRequestedBy(message.requestedBy);
      },
      onError(message) {
        setErrors([message]);
      },
    });
    return () => {
      controller.disconnectLive();
    };
  }, [
    liveConnectionKey,
    controller,
    setClientState,
    setErrors,
    setRematchRequestedBy,
  ]);

  useEffect(() => {
    if (lobbyConnectionKey === undefined) {
      controller.disconnectLobbyLive();
      return;
    }
    controller.connectLobbyLive({
      onState(nextState) {
        if (
          isMatchClientState(nextState) ||
          isFirstPlayerSetupClientState(nextState)
        ) {
          setMatchLocation(nextState.matchId);
        } else if (isLobbyClientState(nextState)) {
          setLobbyLocation(nextState);
        }
        setClientState(nextState);
        setErrors([]);
      },
      onError(message) {
        setErrors([message]);
      },
    });
    return () => {
      controller.disconnectLobbyLive();
    };
  }, [lobbyConnectionKey, controller, setClientState, setErrors]);
};
