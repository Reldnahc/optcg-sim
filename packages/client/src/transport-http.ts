import type { MatchId } from "@optcg/types";

import type {
  ClaimedSeat,
  CreatedMatch,
  JoinedLobby,
  LocalLobby,
  MatchCardCatalog,
  MatchSnapshot,
  MatchTransport,
} from "./transport.js";

export interface DevHttpMatchTransportOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/u, "");

const jsonHeaders = (sessionToken?: string): HeadersInit => ({
  "content-type": "application/json",
  ...(sessionToken === undefined
    ? {}
    : { "x-optcg-session-token": sessionToken }),
});

const readJson = async <T>(response: Response): Promise<T> => {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      `Match transport request failed with HTTP ${String(response.status)}: ${JSON.stringify(
        body,
      )}`,
    );
  }
  return body as T;
};

export const createDevHttpMatchTransport = ({
  baseUrl,
  fetch: fetchImpl = fetch,
}: DevHttpMatchTransportOptions): MatchTransport => {
  const root = trimTrailingSlash(baseUrl);
  const matchPath = (matchId: MatchId, path: string): string =>
    `${root}/api/matches/${encodeURIComponent(String(matchId))}${path}`;
  const lobbyPath = (lobbyId: string, path = ""): string =>
    `${root}/api/lobbies/${encodeURIComponent(lobbyId)}${path}`;

  const postJson = async <T>(
    url: string,
    body: unknown,
    sessionToken?: string,
  ): Promise<T> => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: jsonHeaders(sessionToken),
      body: JSON.stringify(body),
    });
    return readJson<T>(response);
  };

  return {
    async createLobby() {
      return postJson<LocalLobby>(`${root}/api/lobbies`, {});
    },
    async joinLobby(input) {
      return postJson<JoinedLobby>(
        lobbyPath(input.lobbyId, "/join"),
        {},
        input.guestToken,
      );
    },
    async submitLobbyDeck(input) {
      return postJson<LocalLobby>(
        lobbyPath(input.lobbyId, "/deck"),
        { deckHash: input.deckHash, donDeckCount: input.donDeckCount },
        input.guestToken,
      );
    },
    async loadLobby(lobbyId) {
      const response = await fetchImpl(lobbyPath(lobbyId));
      return readJson<LocalLobby>(response);
    },
    async createMatch() {
      return postJson<CreatedMatch>(`${root}/api/matches`, {});
    },
    async createRematch(input) {
      return postJson<CreatedMatch>(
        matchPath(input.matchId, "/rematch"),
        { playerId: input.playerId },
        input.sessionToken,
      );
    },
    async claimSeat(input) {
      const url = matchPath(
        input.matchId,
        `/seats/${encodeURIComponent(String(input.playerId))}/claim`,
      );
      return postJson<ClaimedSeat>(url, undefined, input.sessionToken);
    },
    async chooseFirstPlayer(input) {
      return postJson(matchPath(input.matchId, "/first-player-choice"), {
        playerId: input.playerId,
        choice: input.choice,
      });
    },
    async loadState(matchId) {
      const response = await fetchImpl(matchPath(matchId, "/state"));
      return readJson<MatchSnapshot>(response);
    },
    async loadCards(matchId) {
      const response = await fetchImpl(matchPath(matchId, "/cards"));
      return readJson<MatchCardCatalog>(response);
    },
  };
};
