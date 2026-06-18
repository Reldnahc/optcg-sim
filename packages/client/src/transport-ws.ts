import type {
  LobbyLiveTransport,
  LobbyStateSyncMessage,
  MatchActionResult,
  MatchActionResultMessage,
  MatchLiveConnectionStatus,
  MatchLiveTransport,
  MatchRematchRequestMessage,
  MatchServerShutdownMessage,
  MatchSessionTransitionMessage,
  MatchSetupSyncMessage,
  MatchStateSyncMessage,
  MatchTimerSyncMessage,
  CancelRollbackInput,
  RequestRollbackInput,
} from "./transport.js";
import { requestHash } from "./session-request-hash.js";

export interface DevWebSocketMatchTransportOptions {
  baseUrl: string;
  WebSocket?: typeof WebSocket;
  randomUUID?: () => string;
  reconnectDelayMs?: number;
}

type PendingRequest = {
  acceptedStateSeq?: number | undefined;
  resolve: (result: MatchActionResult) => void;
  reject: (error: Error) => void;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/u, "");

const createClientActionId = (): string => {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes.set([((bytes.at(6) ?? 0) & 0x0f) | 0x40], 6);
  bytes.set([((bytes.at(8) ?? 0) & 0x3f) | 0x80], 8);
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const socketRoot = (baseUrl: string): string => {
  if (baseUrl.length === 0) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }
  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return trimTrailingSlash(parsed.toString());
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStateSync = (value: unknown): value is MatchStateSyncMessage =>
  isRecord(value) && value["type"] === "stateSync";

const isTimerSync = (value: unknown): value is MatchTimerSyncMessage =>
  isRecord(value) && value["type"] === "timerSync";

const isSetupSync = (value: unknown): value is MatchSetupSyncMessage =>
  isRecord(value) && value["type"] === "setupSync";

const isSessionTransition = (
  value: unknown,
): value is MatchSessionTransitionMessage =>
  isRecord(value) && value["type"] === "sessionTransition";

const isRematchRequest = (
  value: unknown,
): value is MatchRematchRequestMessage =>
  isRecord(value) && value["type"] === "rematchRequest";

const isServerShutdown = (
  value: unknown,
): value is MatchServerShutdownMessage =>
  isRecord(value) && value["type"] === "serverShutdown";

const isLobbySync = (value: unknown): value is LobbyStateSyncMessage =>
  isRecord(value) && value["type"] === "lobbySync";

const isActionResult = (value: unknown): value is MatchActionResultMessage =>
  isRecord(value) && value["type"] === "actionResult";

const messageError = (value: unknown): string =>
  isRecord(value) && typeof value["message"] === "string"
    ? value["message"]
    : "Unknown WebSocket message error.";

export const createDevWebSocketMatchTransport = ({
  baseUrl,
  WebSocket: WebSocketImpl = WebSocket,
  randomUUID = createClientActionId,
  reconnectDelayMs = 1_000,
}: DevWebSocketMatchTransportOptions): MatchLiveTransport => ({
  connect({
    matchId,
    playerId,
    sessionToken,
    onStateSync,
    onTimerSync,
    onSetupSync,
    onSessionTransition,
    onRematchRequest,
    onConnectionStatus,
    onError,
  }) {
    const url = new URL(
      `/api/matches/${encodeURIComponent(String(matchId))}/ws`,
      socketRoot(baseUrl),
    );
    url.searchParams.set("playerId", String(playerId));
    url.searchParams.set("sessionToken", sessionToken);

    const pending = new Map<string, PendingRequest>();
    let socket: WebSocket;
    let openPromise: Promise<void>;
    let intentionallyClosed = false;
    let establishedConnection = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let connectionStatus: MatchLiveConnectionStatus | undefined;

    const emitConnectionStatus = (status: MatchLiveConnectionStatus): void => {
      if (connectionStatus === status) {
        return;
      }
      connectionStatus = status;
      onConnectionStatus?.(status);
    };

    const rejectPending = (error: Error): void => {
      for (const request of pending.values()) {
        request.reject(error);
      }
      pending.clear();
    };

    const clearReconnectTimer = (): void => {
      if (reconnectTimer === undefined) {
        return;
      }
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    };

    const handleMessage = (event: MessageEvent): void => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data)) as unknown;
      } catch {
        onError("Received invalid WebSocket JSON.");
        return;
      }

      if (isStateSync(parsed)) {
        onStateSync(parsed);
        for (const [clientActionId, request] of pending) {
          if (
            request.acceptedStateSeq === undefined ||
            parsed.stateSeq < request.acceptedStateSeq
          ) {
            continue;
          }
          pending.delete(clientActionId);
          request.resolve({
            snapshot: parsed.snapshot,
            cards: parsed.cards,
            errors: [],
          });
        }
        return;
      }

      if (isTimerSync(parsed)) {
        onTimerSync(parsed);
        return;
      }

      if (isSetupSync(parsed)) {
        onSetupSync(parsed);
        return;
      }

      if (isSessionTransition(parsed)) {
        onSessionTransition(parsed);
        return;
      }

      if (isRematchRequest(parsed)) {
        onRematchRequest(parsed);
        return;
      }

      if (isServerShutdown(parsed)) {
        emitConnectionStatus("reconnecting");
        return;
      }

      if (isActionResult(parsed)) {
        const request = pending.get(parsed.clientActionId);
        if (request === undefined) {
          return;
        }
        pending.delete(parsed.clientActionId);
        if (!parsed.accepted) {
          request.reject(new Error(parsed.errors.join("\n")));
          pending.delete(parsed.clientActionId);
          return;
        }
        pending.set(parsed.clientActionId, {
          ...request,
          acceptedStateSeq: parsed.stateSeq,
        });
        return;
      }

      if (isRecord(parsed) && parsed["type"] === "matchError") {
        onError(messageError(parsed));
      }
    };

    const handleError = (): void => {
      onError("Match WebSocket error.");
    };

    const connectSocket = ({
      reconnecting,
    }: {
      reconnecting: boolean;
    }): void => {
      let opened = false;
      emitConnectionStatus(reconnecting ? "reconnecting" : "connecting");
      const nextSocket = new WebSocketImpl(url);
      socket = nextSocket;
      openPromise = new Promise<void>((resolve, reject) => {
        nextSocket.addEventListener(
          "open",
          () => {
            opened = true;
            establishedConnection = true;
            emitConnectionStatus("connected");
            resolve();
          },
          { once: true },
        );
        nextSocket.addEventListener(
          "error",
          () => {
            if (!opened) {
              reject(new Error("Match WebSocket failed to open."));
            }
          },
          { once: true },
        );
        nextSocket.addEventListener(
          "close",
          () => {
            if (!opened) {
              reject(new Error("Match WebSocket closed before opening."));
            }
          },
          { once: true },
        );
      });
      void openPromise.catch(() => undefined);
      nextSocket.addEventListener("message", handleMessage);
      const scheduleReconnect = (): void => {
        if (intentionallyClosed || reconnectTimer !== undefined) {
          return;
        }
        emitConnectionStatus(
          establishedConnection ? "reconnecting" : "connecting",
        );
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          if (intentionallyClosed || nextSocket !== socket) {
            return;
          }
          connectSocket({ reconnecting: establishedConnection });
        }, reconnectDelayMs);
      };
      nextSocket.addEventListener("close", () => {
        if (nextSocket === socket) {
          rejectPending(new Error("Match WebSocket closed."));
          scheduleReconnect();
        }
      });
      nextSocket.addEventListener("error", () => {
        handleError();
        if (!opened && nextSocket === socket) {
          scheduleReconnect();
        }
      });
    };

    connectSocket({ reconnecting: false });

    const ensureOpenSocket = async (): Promise<void> => {
      if (intentionallyClosed) {
        throw new Error("Match WebSocket closed.");
      }
      if (
        socket.readyState === WebSocket.CLOSING ||
        socket.readyState === WebSocket.CLOSED
      ) {
        clearReconnectTimer();
        connectSocket({ reconnecting: establishedConnection });
      }
      await openPromise;
    };

    const sendRequest = async (
      payload: Record<string, unknown>,
      clientActionId: string,
    ): Promise<MatchActionResult> => {
      const result = new Promise<MatchActionResult>((resolve, reject) => {
        pending.set(clientActionId, { resolve, reject });
      });
      try {
        await ensureOpenSocket();
        socket.send(JSON.stringify(payload));
      } catch (error: unknown) {
        pending.delete(clientActionId);
        throw error instanceof Error ? error : new Error(String(error));
      }
      return await result;
    };

    return {
      close() {
        intentionallyClosed = true;
        clearReconnectTimer();
        socket.close();
        rejectPending(new Error("Match WebSocket closed."));
      },
      submitVisibleAction(input) {
        const clientActionId = randomUUID();
        const request = {
          type: "submitAction" as const,
          playerId: input.playerId,
          actionIndex: input.actionIndex,
          expectedStateSeq: input.expectedStateSeq,
          ...(input.selectedDonInstanceIds === undefined
            ? {}
            : { selectedDonInstanceIds: input.selectedDonInstanceIds }),
        };
        return requestHash(request).then((hash) =>
          sendRequest(
            {
              ...request,
              clientActionId,
              matchId: input.matchId,
              requestHash: hash,
            },
            clientActionId,
          ),
        );
      },
      respondToDecision(input) {
        const clientActionId = randomUUID();
        const request = {
          type: "respondToDecision" as const,
          playerId: input.playerId,
          decisionId: input.decisionId,
          response: input.response,
        };
        return requestHash(request).then((hash) =>
          sendRequest(
            {
              ...request,
              clientActionId,
              matchId: input.matchId,
              expectedStateSeq: input.expectedStateSeq,
              expectedDecisionId: input.expectedDecisionId,
              requestHash: hash,
            },
            clientActionId,
          ),
        );
      },
      requestRollback(input: RequestRollbackInput) {
        const clientActionId = randomUUID();
        const request = {
          type: "requestRollback" as const,
          playerId: input.playerId,
          rollbackPointId: input.rollbackPointId,
          expectedStateSeq: input.expectedStateSeq,
        };
        return requestHash(request).then((hash) =>
          sendRequest(
            {
              ...request,
              clientActionId,
              matchId: input.matchId,
              requestHash: hash,
            },
            clientActionId,
          ),
        );
      },
      cancelRollback(input: CancelRollbackInput) {
        const clientActionId = randomUUID();
        const request = {
          type: "cancelRollback" as const,
          playerId: input.playerId,
          expectedStateSeq: input.expectedStateSeq,
        };
        return requestHash(request).then((hash) =>
          sendRequest(
            {
              ...request,
              clientActionId,
              matchId: input.matchId,
              requestHash: hash,
            },
            clientActionId,
          ),
        );
      },
    };
  },
});

export const createDevWebSocketLobbyTransport = ({
  baseUrl,
  WebSocket: WebSocketImpl = WebSocket,
}: DevWebSocketMatchTransportOptions): LobbyLiveTransport => ({
  connect({ lobbyId, playerId, sessionToken, onLobbySync, onError }) {
    const url = new URL(
      `/api/lobbies/${encodeURIComponent(lobbyId)}/ws`,
      socketRoot(baseUrl),
    );
    url.searchParams.set("playerId", String(playerId));
    url.searchParams.set("sessionToken", sessionToken);

    const socket = new WebSocketImpl(url);
    socket.addEventListener("message", (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data)) as unknown;
      } catch {
        onError("Received invalid WebSocket JSON.");
        return;
      }

      if (isLobbySync(parsed)) {
        onLobbySync(parsed);
        return;
      }

      if (isRecord(parsed) && parsed["type"] === "lobbyError") {
        onError(messageError(parsed));
      }
    });
    socket.addEventListener("error", () => {
      onError("Lobby WebSocket error.");
    });

    return {
      close() {
        socket.close();
      },
    };
  },
});
