import type {
  MatchClientController,
  MatchClientSessionState,
} from "../controller.js";
import { lobbyIdFromPath, matchIdFromUrl } from "./useMatchClient-support.js";

export const loadInitialMatchClientState = async (
  controller: MatchClientController,
): Promise<MatchClientSessionState> => {
  const urlMatchId = matchIdFromUrl();
  const urlLobbyId = lobbyIdFromPath();
  const credential =
    urlMatchId === undefined ? undefined : controller.currentCredential();
  if (urlMatchId !== undefined) {
    if (credential === undefined || credential.matchId !== urlMatchId) {
      throw new Error(
        "Cannot open this match without a saved seat session. Join from its lobby instead.",
      );
    }
    return await controller.joinLocalMatch({
      matchId: urlMatchId,
      playerId: credential.playerId,
    });
  }
  if (urlLobbyId !== undefined) {
    return await controller.joinLocalLobby({ lobbyId: urlLobbyId });
  }
  return await controller.startNewLocalLobby();
};
