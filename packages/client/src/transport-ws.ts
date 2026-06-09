import type {
  LobbyLiveTransport,
  LobbyStateSyncMessage,
  MatchActionResult,
  MatchActionResultMessage,
  MatchLiveTransport,
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
}

type PendingRequest = {
  accepted: boolean;
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
}: DevWebSocketMatchTransportOptions): MatchLiveTransport => ({
  connect({
    matchId,
    playerId,
    sessionToken,
    onStateSync,
    onTimerSync,
    onSetupSync,
    onSessionTransition,
    onError,
  }) {
    const url = new URL(
      `/api/matches/${encodeURIComponent(String(matchId))}/ws`,
      socketRoot(baseUrl),
    );
    url.searchParams.set("playerId", String(playerId));
    url.searchParams.set("sessionToken", sessionToken);

    const socket = new WebSocketImpl(url);
    const pending = new Map<string, PendingRequest>();
    let opened = false;

    const openPromise = new Promise<void>((resolve, reject) => {
      socket.addEventListener(
        "open",
        () => {
          opened = true;
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          if (!opened) {
            reject(new Error("Match WebSocket failed to open."));
          }
        },
        { once: true },
      );
    });
    void openPromise.catch(() => undefined);

    const rejectPending = (error: Error): void => {
      for (const request of pending.values()) {
        request.reject(error);
      }
      pending.clear();
    };

    socket.addEventListener("message", (event) => {
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
          if (!request.accepted) {
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
        pending.set(parsed.clientActionId, { ...request, accepted: true });
        return;
      }

      if (isRecord(parsed) && parsed["type"] === "matchError") {
        onError(messageError(parsed));
      }
    });

    socket.addEventListener("close", () => {
      rejectPending(new Error("Match WebSocket closed."));
    });
    socket.addEventListener("error", () => {
      onError("Match WebSocket error.");
    });

    const sendRequest = async (
      payload: Record<string, unknown>,
      clientActionId: string,
    ): Promise<MatchActionResult> => {
      const result = new Promise<MatchActionResult>((resolve, reject) => {
        pending.set(clientActionId, { accepted: false, resolve, reject });
      });
      try {
        await openPromise;
        socket.send(JSON.stringify(payload));
      } catch (error: unknown) {
        pending.delete(clientActionId);
        throw error instanceof Error ? error : new Error(String(error));
      }
      return await result;
    };

    return {
      close() {
        socket.close();
      },
      submitVisibleAction(input) {
        const clientActionId = randomUUID();
        const request = {
          type: "submitAction" as const,
          playerId: input.playerId,
          actionIndex: input.actionIndex,
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
