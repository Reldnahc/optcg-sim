import {
  createClientSessionStore,
  createDevHttpMatchTransport,
  createDevWebSocketLobbyTransport,
  createDevWebSocketMatchTransport,
  createMatchClientController,
} from "./index.js";
import type { MatchClientController } from "./index.js";
import { createBrowserSessionStorage } from "./react/browser-storage.js";

export const createController = (): MatchClientController =>
  createMatchClientController({
    transport: createDevHttpMatchTransport({ baseUrl: "" }),
    liveTransport: createDevWebSocketMatchTransport({ baseUrl: "" }),
    lobbyLiveTransport: createDevWebSocketLobbyTransport({ baseUrl: "" }),
    sessionStore: createClientSessionStore({
      storage: createBrowserSessionStorage(),
    }),
  });
