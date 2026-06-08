import { randomUUID } from "node:crypto";

import type { MatchId, PlayerId } from "@optcg/types";

import type { AuthSubject } from "./dev-auth.js";
import type { DeckSubmission } from "./deck-submission.js";
import type { RedisLike } from "./redis-match-persistence.js";
import type { FirstPlayerChoiceState } from "./session-types.js";

export interface LocalDevLobbySeatState {
  readonly playerId: PlayerId;
  subject?: AuthSubject;
  deckSubmission?: DeckSubmission;
}

export interface LocalDevLobbyState {
  readonly lobbyId: string;
  readonly seats: Record<string, LocalDevLobbySeatState>;
  firstPlayerChoice?: FirstPlayerChoiceState;
  playerOrder?: readonly [PlayerId, PlayerId];
  matchId?: MatchId;
}

export interface LobbyStore {
  createLobby: (lobby: LocalDevLobbyState) => Promise<LocalDevLobbyState>;
  getLobby: (lobbyId: string) => Promise<LocalDevLobbyState | undefined>;
  updateLobby: <T>(
    lobbyId: string,
    update: (lobby: LocalDevLobbyState) => Promise<T>,
  ) => Promise<T | "lobbyNotFound">;
  createLobbyId: () => string;
}

export interface RedisLobbyStoreOptions {
  readonly redis: RedisLike;
  readonly ttlMs?: number;
  readonly lockTtlMs?: number;
}

const defaultLobbyTtlMs = 1000 * 60 * 60 * 4;
const defaultLockTtlMs = 5000;

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const keyForLobby = (lobbyId: string): string => `lobby:${lobbyId}:state`;
const keyForLock = (lobbyId: string): string => `lobby:${lobbyId}:lock`;

const serialize = (value: unknown): string => JSON.stringify(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseLobby = (value: string): LocalDevLobbyState => {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed) || typeof parsed["lobbyId"] !== "string") {
    throw new TypeError("Redis lobby state is malformed.");
  }
  if (!isRecord(parsed["seats"])) {
    throw new TypeError("Redis lobby seats are malformed.");
  }
  return {
    lobbyId: parsed["lobbyId"],
    seats: parsed["seats"] as LocalDevLobbyState["seats"],
    ...(parsed["firstPlayerChoice"] === undefined
      ? {}
      : {
          firstPlayerChoice: parsed[
            "firstPlayerChoice"
          ] as FirstPlayerChoiceState,
        }),
    ...(Array.isArray(parsed["playerOrder"]) && parsed["playerOrder"].length > 1
      ? {
          playerOrder: [
            parsed["playerOrder"][0] as PlayerId,
            parsed["playerOrder"][1] as PlayerId,
          ],
        }
      : {}),
    ...(typeof parsed["matchId"] === "string"
      ? { matchId: parsed["matchId"] as MatchId }
      : {}),
  };
};

export const createMemoryLobbyStore = (): LobbyStore => {
  let nextLobbyNumber = 1;
  const lobbies = new Map<string, LocalDevLobbyState>();
  return {
    createLobbyId() {
      return `dev-local-lobby-${String(nextLobbyNumber++)}`;
    },
    createLobby(lobby) {
      lobbies.set(lobby.lobbyId, structuredClone(lobby));
      return Promise.resolve(structuredClone(lobby));
    },
    getLobby(lobbyId) {
      const lobby = lobbies.get(lobbyId);
      return Promise.resolve(
        lobby === undefined ? undefined : structuredClone(lobby),
      );
    },
    async updateLobby(lobbyId, update) {
      const lobby = lobbies.get(lobbyId);
      if (lobby === undefined) {
        return "lobbyNotFound";
      }
      const next = structuredClone(lobby);
      const result = await update(next);
      lobbies.set(lobbyId, next);
      return result;
    },
  };
};

const acquireLock = async (
  redis: RedisLike,
  lobbyId: string,
  token: string,
  lockTtlMs: number,
): Promise<boolean> =>
  (await redis.set(keyForLock(lobbyId), token, {
    nx: true,
    px: lockTtlMs,
  })) === "OK";

const releaseLock = async (
  redis: RedisLike,
  lobbyId: string,
  token: string,
): Promise<void> => {
  const key = keyForLock(lobbyId);
  if ((await redis.get(key)) === token) {
    await redis.del(key);
  }
};

export const createRedisLobbyStore = ({
  redis,
  ttlMs = defaultLobbyTtlMs,
  lockTtlMs = defaultLockTtlMs,
}: RedisLobbyStoreOptions): LobbyStore => ({
  createLobbyId() {
    return `lobby-${randomUUID()}`;
  },
  async createLobby(lobby) {
    await redis.set(keyForLobby(lobby.lobbyId), serialize(lobby), {
      px: ttlMs,
    });
    return lobby;
  },
  async getLobby(lobbyId) {
    const value = await redis.get(keyForLobby(lobbyId));
    return value === null ? undefined : parseLobby(value);
  },
  async updateLobby(lobbyId, update) {
    const token = randomUUID();
    if (!(await acquireLock(redis, lobbyId, token, lockTtlMs))) {
      throw new Error("Lobby is busy. Try again.");
    }
    try {
      const value = await redis.get(keyForLobby(lobbyId));
      if (value === null) {
        return "lobbyNotFound";
      }
      const lobby = parseLobby(value);
      const result = await update(lobby);
      await redis.set(keyForLobby(lobbyId), serialize(lobby), { px: ttlMs });
      return result;
    } finally {
      await releaseLock(redis, lobbyId, token);
    }
  },
});

export const createDefaultLobbySeats = (): LocalDevLobbyState["seats"] => ({
  p1: { playerId: p1 },
  p2: { playerId: p2 },
});

export const createRedisClientForLobbyStore = async (
  url: string,
): Promise<RedisLike> => {
  const redis = await import("redis");
  const client = redis.createClient({ url });
  await client.connect();
  return {
    get: (key) => client.get(key),
    async set(key, value, options) {
      const result = await client.set(key, value, {
        ...(options?.nx === true ? { NX: true } : {}),
        ...(options?.px === undefined ? {} : { PX: options.px }),
      });
      return result === "OK" ? "OK" : null;
    },
    del: (key) => client.del(key),
    rPush: (key, ...values) => client.rPush(key, values),
    lRange: (key, start, stop) => client.lRange(key, start, stop),
    async scan(cursor, options) {
      const result = await client.scan(cursor, {
        MATCH: options.match,
        COUNT: options.count,
      });
      return [result.cursor, result.keys];
    },
  };
};
