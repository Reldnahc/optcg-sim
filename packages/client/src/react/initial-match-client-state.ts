import type {
  MatchClientController,
  MatchClientSessionState,
} from "../controller.js";
import {
  lobbyFormatIdFromUrl,
  lobbyJoinCodeFromPath,
  lobbyIdFromPath,
  lobbyTimerDisabledFromUrl,
  matchIdFromUrl,
} from "./useMatchClient-support.js";

export const loadInitialMatchClientState = async (
  controller: MatchClientController,
): Promise<MatchClientSessionState> => {
  const urlMatchId = matchIdFromUrl();
  const urlLobbyJoinCode = lobbyJoinCodeFromPath();
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
  if (urlLobbyJoinCode !== undefined) {
    return await controller.joinCustomLobbyByCode({
      joinCode: urlLobbyJoinCode,
    });
  }
  const lobbyFormatId = lobbyFormatIdFromUrl();
  const timerDisabled = lobbyTimerDisabledFromUrl();
  return await controller.startCustomLobby(
    lobbyFormatId === undefined && !timerDisabled
      ? undefined
      : {
          settings: {
            formatId: lobbyFormatId ?? "sandbox-open",
            ...(timerDisabled ? { timerDisabled: true } : {}),
          },
        },
  );
};
