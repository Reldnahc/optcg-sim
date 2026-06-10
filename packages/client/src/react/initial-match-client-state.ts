import type {
  MatchClientController,
  MatchClientSessionState,
} from "../controller.js";
import {
  lobbyFormatIdFromUrl,
  lobbyIdFromPath,
  matchIdFromUrl,
} from "./useMatchClient-support.js";

export const loadInitialMatchClientState = async (
  controller: MatchClientController,
): Promise<MatchClientSessionState> => {
  const urlMatchId = matchIdFromUrl();
  const urlLobbyId = lobbyIdFromPath();
  const credential =
    urlMatchId === undefined ? undefined : controller.currentCredential();
  if (urlMatchId !== undefined) {
    if (credential === undefined || credential.matchId !== urlMatchId) {
      return await controller.joinLocalMatchByAccount({ matchId: urlMatchId });
    }
    return await controller.joinLocalMatch({
      matchId: urlMatchId,
      playerId: credential.playerId,
    });
  }
  if (urlLobbyId !== undefined) {
    return await controller.joinCustomLobby({ lobbyId: urlLobbyId });
  }
  const lobbyFormatId = lobbyFormatIdFromUrl();
  return await controller.startCustomLobby(
    lobbyFormatId === undefined
      ? undefined
      : { settings: { formatId: lobbyFormatId } },
  );
};
