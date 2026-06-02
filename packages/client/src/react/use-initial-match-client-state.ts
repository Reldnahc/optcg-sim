import { useEffect } from "react";

import type { MatchClientController } from "../controller.js";
import type { MatchClientSessionState } from "../index.js";
import { loadInitialMatchClientState } from "./initial-match-client-state.js";
import {
  isFirstPlayerSetupClientState,
  isLobbyClientState,
  isMatchClientState,
  setLobbyLocation,
  setMatchLocation,
} from "./useMatchClient-support.js";

export const useInitialMatchClientState = ({
  controller,
  setClientState,
  setErrors,
}: {
  controller: MatchClientController;
  setClientState: (state: MatchClientSessionState) => void;
  setErrors: (errors: string[]) => void;
}): void => {
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const loaded = await loadInitialMatchClientState(controller);
        if (cancelled) {
          return;
        }
        if (
          isMatchClientState(loaded) ||
          isFirstPlayerSetupClientState(loaded)
        ) {
          setMatchLocation(loaded.matchId);
        } else if (isLobbyClientState(loaded)) {
          setLobbyLocation(loaded.lobbyId);
        }
        setClientState(loaded);
        setErrors([]);
      } catch (error) {
        if (!cancelled) {
          setErrors([error instanceof Error ? error.message : String(error)]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [controller, setClientState, setErrors]);
};
