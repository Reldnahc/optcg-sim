import { randomInt, randomUUID } from "node:crypto";

import type { MatchId, PlayerId } from "@optcg/types";

import type { AuthSubject } from "./dev-auth.js";
import type { ReadyDeckSubmission } from "./deck-submission.js";
import type { DevDeckVerificationMode } from "./default-dev-manifest.js";
import type { RedisLike } from "./redis-match-persistence.js";
import type { FirstPlayerChoiceState } from "./session-types.js";
import type { VerifiedSimHandoff } from "./sim-handoff.js";

export interface CustomLobbySeatState {
  readonly playerId: PlayerId;
  subject?: AuthSubject;
  deckSubmission?: ReadyDeckSubmission;
  deckSubmissionVerificationMode?: DevDeckVerificationMode;
  verifiedHandoff?: VerifiedSimHandoff;
}

export interface CustomLobbySettings {
  readonly formatId: string;
  readonly timerDisabled?: boolean;
  readonly botOpponent?: boolean;
}

export interface CustomLobbyState {
  readonly lobbyId: string;
  readonly joinCode?: string;
  readonly seats: Record<string, CustomLobbySeatState>;
  settings?: CustomLobbySettings;
  firstPlayerChoice?: FirstPlayerChoiceState;
  playerOrder?: readonly [PlayerId, PlayerId];
  rematchOfMatchId?: MatchId;
  matchId?: MatchId;
}

export interface LobbyStore {
  createLobby: (lobby: CustomLobbyState) => Promise<CustomLobbyState>;
  getLobby: (lobbyId: string) => Promise<CustomLobbyState | undefined>;
  createLobbyJoinCode: (lobbyId: string) => Promise<string>;
  setLobbyJoinCode: (lobbyId: string, joinCode: string) => Promise<void>;
  getLobbyIdByJoinCode: (joinCode: string) => Promise<string | undefined>;
  setLobbyMatchId: (lobbyId: string, matchId: MatchId) => Promise<void>;
  getLobbyIdByMatchId: (matchId: MatchId) => Promise<string | undefined>;
  deleteLobby: (lobbyId: string) => Promise<boolean>;
  updateLobby: <T>(
    lobbyId: string,
    update: (lobby: CustomLobbyState) => Promise<T>,
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
const keyForJoinCode = (joinCode: string): string =>
  `lobby:join-code:${joinCode}`;
const keyForMatch = (matchId: MatchId): string => `lobby:match:${matchId}`;
const keyForLock = (lobbyId: string): string => `lobby:${lobbyId}:lock`;
const joinCodeAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const joinCodeLength = 4;
const joinCodeCreateAttempts = 10;

const serialize = (value: unknown): string => JSON.stringify(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseLobby = (value: string): CustomLobbyState => {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed) || typeof parsed["lobbyId"] !== "string") {
    throw new TypeError("Redis lobby state is malformed.");
  }
  if (!isRecord(parsed["seats"])) {
    throw new TypeError("Redis lobby seats are malformed.");
  }
  return {
    lobbyId: parsed["lobbyId"],
    ...(typeof parsed["joinCode"] === "string"
      ? { joinCode: parsed["joinCode"] }
      : {}),
    seats: parsed["seats"] as CustomLobbyState["seats"],
    ...(isRecord(parsed["settings"]) &&
    typeof parsed["settings"]["formatId"] === "string"
      ? {
          settings: {
            formatId: parsed["settings"]["formatId"],
            ...(parsed["settings"]["timerDisabled"] === true
              ? { timerDisabled: true }
              : {}),
            ...(parsed["settings"]["botOpponent"] === true
              ? { botOpponent: true }
              : {}),
          },
        }
      : {}),
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
    ...(typeof parsed["rematchOfMatchId"] === "string"
      ? { rematchOfMatchId: parsed["rematchOfMatchId"] as MatchId }
      : {}),
    ...(typeof parsed["matchId"] === "string"
      ? { matchId: parsed["matchId"] as MatchId }
      : {}),
  };
};

const normalizeJoinCode = (value: string): string => value.trim().toLowerCase();

const createRandomJoinCode = (): string =>
  Array.from(
    { length: joinCodeLength },
    () => joinCodeAlphabet[randomInt(joinCodeAlphabet.length)] ?? "0",
  ).join("");

export const createMemoryLobbyStore = (): LobbyStore => {
  let nextLobbyNumber = 1;
  const lobbies = new Map<string, CustomLobbyState>();
  const lobbyIdsByJoinCode = new Map<string, string>();
  const lobbyIdsByMatchId = new Map<MatchId, string>();
  return {
    createLobbyId() {
      return `lobby-${String(nextLobbyNumber++)}`;
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
    createLobbyJoinCode(lobbyId) {
      for (let attempt = 0; attempt < joinCodeCreateAttempts; attempt += 1) {
        const joinCode = createRandomJoinCode();
        if (lobbyIdsByJoinCode.has(joinCode)) {
          continue;
        }
        lobbyIdsByJoinCode.set(joinCode, lobbyId);
        return Promise.resolve(joinCode);
      }
      throw new Error("Unable to allocate a lobby join code.");
    },
    getLobbyIdByJoinCode(joinCode) {
      return Promise.resolve(
        lobbyIdsByJoinCode.get(normalizeJoinCode(joinCode)),
      );
    },
    setLobbyJoinCode(lobbyId, joinCode) {
      lobbyIdsByJoinCode.set(normalizeJoinCode(joinCode), lobbyId);
      return Promise.resolve();
    },
    setLobbyMatchId(lobbyId, matchId) {
      lobbyIdsByMatchId.set(matchId, lobbyId);
      return Promise.resolve();
    },
    getLobbyIdByMatchId(matchId) {
      return Promise.resolve(lobbyIdsByMatchId.get(matchId));
    },
    deleteLobby(lobbyId) {
      const lobby = lobbies.get(lobbyId);
      if (
        lobby?.joinCode !== undefined &&
        lobbyIdsByJoinCode.get(lobby.joinCode) === lobbyId
      ) {
        lobbyIdsByJoinCode.delete(lobby.joinCode);
      }
      if (
        lobby?.matchId !== undefined &&
        lobbyIdsByMatchId.get(lobby.matchId) === lobbyId
      ) {
        lobbyIdsByMatchId.delete(lobby.matchId);
      }
      return Promise.resolve(lobbies.delete(lobbyId));
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
  async createLobbyJoinCode(lobbyId) {
    for (let attempt = 0; attempt < joinCodeCreateAttempts; attempt += 1) {
      const joinCode = createRandomJoinCode();
      const created = await redis.set(keyForJoinCode(joinCode), lobbyId, {
        nx: true,
        px: ttlMs,
      });
      if (created === "OK") {
        return joinCode;
      }
    }
    throw new Error("Unable to allocate a lobby join code.");
  },
  async getLobbyIdByJoinCode(joinCode) {
    return (
      (await redis.get(keyForJoinCode(normalizeJoinCode(joinCode)))) ??
      undefined
    );
  },
  async setLobbyJoinCode(lobbyId, joinCode) {
    await redis.set(keyForJoinCode(normalizeJoinCode(joinCode)), lobbyId, {
      px: ttlMs,
    });
  },
  async setLobbyMatchId(lobbyId, matchId) {
    await redis.set(keyForMatch(matchId), lobbyId, { px: ttlMs });
  },
  async getLobbyIdByMatchId(matchId) {
    return (await redis.get(keyForMatch(matchId))) ?? undefined;
  },
  async deleteLobby(lobbyId) {
    const value = await redis.get(keyForLobby(lobbyId));
    const lobby = value === null ? undefined : parseLobby(value);
    let deleted = await redis.del(keyForLobby(lobbyId));
    if (
      lobby?.joinCode !== undefined &&
      (await redis.get(keyForJoinCode(lobby.joinCode))) === lobbyId
    ) {
      deleted += await redis.del(keyForJoinCode(lobby.joinCode));
    }
    if (
      lobby?.matchId !== undefined &&
      (await redis.get(keyForMatch(lobby.matchId))) === lobbyId
    ) {
      deleted += await redis.del(keyForMatch(lobby.matchId));
    }
    return deleted > 0;
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

export const createDefaultLobbySeats = (): CustomLobbyState["seats"] => ({
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
