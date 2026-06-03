import {
  createClientSessionStore,
  createDevHttpMatchTransport,
  createDevWebSocketLobbyTransport,
  createDevWebSocketMatchTransport,
  createMatchClientController,
} from "./index.js";
import type { MatchClientController } from "./index.js";
import { createBrowserSessionStorage } from "./react/browser-storage.js";

export interface CreateControllerOptions {
  readonly accountSessionToken: string;
}

export const createController = ({
  accountSessionToken,
}: CreateControllerOptions): MatchClientController =>
  createMatchClientController({
    transport: createDevHttpMatchTransport({ baseUrl: "" }),
    liveTransport: createDevWebSocketMatchTransport({ baseUrl: "" }),
    lobbyLiveTransport: createDevWebSocketLobbyTransport({ baseUrl: "" }),
    accountSessionToken,
    sessionStore: createClientSessionStore({
      storage: createBrowserSessionStorage(),
    }),
  });
