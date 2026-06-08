import {
  createClientSessionStore,
  createDevHttpMatchTransport,
  createDevWebSocketLobbyTransport,
  createDevWebSocketMatchTransport,
  createMatchClientController,
} from "./index.js";
import type { MatchClientController } from "./index.js";
import { matchServerBaseUrlFromEnvironment } from "./match-server-environment.js";
import { createBrowserSessionStorage } from "./react/browser-storage.js";

export interface CreateControllerOptions {
  readonly accountSessionToken: string;
}

export const createController = ({
  accountSessionToken,
}: CreateControllerOptions): MatchClientController => {
  const matchServerBaseUrl = matchServerBaseUrlFromEnvironment(import.meta.env);
  return createMatchClientController({
    transport: createDevHttpMatchTransport({ baseUrl: matchServerBaseUrl }),
    liveTransport: createDevWebSocketMatchTransport({
      baseUrl: matchServerBaseUrl,
    }),
    lobbyLiveTransport: createDevWebSocketLobbyTransport({
      baseUrl: matchServerBaseUrl,
    }),
    accountSessionToken,
    sessionStore: createClientSessionStore({
      storage: createBrowserSessionStorage(),
    }),
  });
};
