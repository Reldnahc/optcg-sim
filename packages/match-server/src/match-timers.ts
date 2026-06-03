import { applyAction, getLegalActions } from "@optcg/engine-core";
import type { GameState, PlayerId, TimerState } from "@optcg/types";

import type { LocalDevMatch } from "./local-match.js";
import { cloneGameState, recordRollbackPoint } from "./local-rollback.js";

export interface MatchTimerPolicy {
  readonly gameTimeMs: number;
  readonly disconnectGraceMs: number;
}

export type MatchTimerExpiryReason = "game" | "disconnect";

export interface MatchTimerExpiry {
  readonly playerId: PlayerId;
  readonly reason: MatchTimerExpiryReason;
}

export interface AdvanceLocalDevMatchTimersInput {
  readonly connectedPlayerIds: ReadonlySet<PlayerId>;
  readonly elapsedMs: number;
  readonly policy: MatchTimerPolicy;
}

export interface AdvanceLocalDevMatchTimersResult {
  readonly expiries: readonly MatchTimerExpiry[];
  readonly changed: boolean;
}

export const defaultMatchTimerPolicy: MatchTimerPolicy = {
  gameTimeMs: 17 * 60 * 1000 + 30 * 1000,
  disconnectGraceMs: 120 * 1000,
};

const playerIds = (state: GameState): PlayerId[] =>
  Object.keys(state.players) as PlayerId[];

const initializedGameTimers = (
  state: GameState,
  policy: MatchTimerPolicy,
): TimerState["players"] =>
  Object.fromEntries(
    playerIds(state).map((playerId) => {
      const existing = state.timers.players[playerId];
      return [
        playerId,
        {
          playerId,
          remainingMs:
            existing === undefined || existing.remainingMs === 0
              ? policy.gameTimeMs
              : existing.remainingMs,
          isRunning: false,
        },
      ] as const;
    }),
  );

export const initializeLocalDevMatchTimers = (
  match: LocalDevMatch,
  policy: MatchTimerPolicy = defaultMatchTimerPolicy,
): void => {
  match.state = {
    ...match.state,
    timers: {
      players: initializedGameTimers(match.state, policy),
    },
  };
};

const nonConcedeLegalActions = (state: GameState, playerId: PlayerId): number =>
  getLegalActions(state, playerId).filter((action) => action.type !== "concede")
    .length;

const gameTimerDrainingPlayerIds = (state: GameState): readonly PlayerId[] => {
  if (state.status.type !== "active" && state.status.type !== "setup") {
    return [];
  }

  const decision = state.pendingDecision;
  if (decision !== undefined) {
    return [decision.playerId];
  }

  if (state.status.type !== "active") {
    return [];
  }

  const holders = playerIds(state).filter(
    (playerId) => nonConcedeLegalActions(state, playerId) > 0,
  );
  return holders.length === 1 ? holders : [];
};

const nextGameTimers = (
  state: GameState,
  elapsedMs: number,
  policy: MatchTimerPolicy,
): {
  readonly players: TimerState["players"];
  readonly expiries: MatchTimerExpiry[];
  readonly drainingPlayerId?: PlayerId;
} => {
  const drainingPlayerIds = new Set(gameTimerDrainingPlayerIds(state));
  const expiries: MatchTimerExpiry[] = [];
  const players = Object.fromEntries(
    playerIds(state).map((playerId) => {
      const existing = state.timers.players[playerId];
      const wasRemaining = existing?.remainingMs ?? policy.gameTimeMs;
      const isRunning = drainingPlayerIds.has(playerId);
      const remainingMs = isRunning
        ? Math.max(0, wasRemaining - elapsedMs)
        : wasRemaining;
      if (isRunning && wasRemaining > 0 && remainingMs === 0) {
        expiries.push({ playerId, reason: "game" });
      }
      return [
        playerId,
        {
          playerId,
          remainingMs,
          isRunning: isRunning && remainingMs > 0,
        },
      ] as const;
    }),
  );
  const activeDrainers = Object.values(players)
    .filter((timer) => timer.isRunning)
    .map((timer) => timer.playerId);
  return {
    players,
    expiries,
    ...(activeDrainers.length === 1
      ? { drainingPlayerId: activeDrainers[0] }
      : {}),
  };
};

const nextDisconnectTimers = (
  state: GameState,
  connectedPlayerIds: ReadonlySet<PlayerId>,
  elapsedMs: number,
  policy: MatchTimerPolicy,
  gameExpiredPlayerIds: ReadonlySet<PlayerId>,
): {
  readonly disconnects?: TimerState["disconnects"];
  readonly expiries: MatchTimerExpiry[];
} => {
  const source = state.timers.disconnects ?? {};
  const entries: Array<
    readonly [PlayerId, NonNullable<TimerState["disconnects"]>[PlayerId]]
  > = [];
  const expiries: MatchTimerExpiry[] = [];

  for (const playerId of playerIds(state)) {
    const existing = source[playerId];
    if (connectedPlayerIds.has(playerId)) {
      if (existing !== undefined) {
        entries.push([playerId, { ...existing, isRunning: false }] as const);
      }
      continue;
    }

    const previousRemaining = existing?.remainingMs ?? policy.disconnectGraceMs;
    const remainingMs = Math.max(0, previousRemaining - elapsedMs);
    entries.push([
      playerId,
      {
        playerId,
        remainingMs,
        isRunning: remainingMs > 0,
      },
    ] as const);
    if (
      !gameExpiredPlayerIds.has(playerId) &&
      previousRemaining > 0 &&
      remainingMs === 0
    ) {
      expiries.push({ playerId, reason: "disconnect" });
    }
  }

  return {
    ...(entries.length === 0
      ? {}
      : { disconnects: Object.fromEntries(entries) }),
    expiries,
  };
};

export const advanceLocalDevMatchTimers = (
  match: LocalDevMatch,
  { connectedPlayerIds, elapsedMs, policy }: AdvanceLocalDevMatchTimersInput,
): AdvanceLocalDevMatchTimersResult => {
  if (
    match.state.status.type === "completed" ||
    match.state.status.type === "gameOver"
  ) {
    return { expiries: [], changed: false };
  }
  const normalizedElapsedMs = Math.max(0, elapsedMs);
  const game = nextGameTimers(match.state, normalizedElapsedMs, policy);
  const gameExpiredPlayerIds = new Set(
    game.expiries.map((expiry) => expiry.playerId),
  );
  const disconnect = nextDisconnectTimers(
    match.state,
    connectedPlayerIds,
    normalizedElapsedMs,
    policy,
    gameExpiredPlayerIds,
  );
  match.state = {
    ...match.state,
    timers: {
      players: game.players,
      ...(game.drainingPlayerId === undefined
        ? {}
        : { drainingPlayerId: game.drainingPlayerId }),
      ...(disconnect.disconnects === undefined
        ? {}
        : { disconnects: disconnect.disconnects }),
    },
  };
  return {
    expiries: [...game.expiries, ...disconnect.expiries],
    changed: true,
  };
};

const stopAllTimers = (state: GameState): GameState => ({
  ...state,
  timers: {
    players: Object.fromEntries(
      playerIds(state).map((playerId) => {
        const timer = state.timers.players[playerId];
        if (timer === undefined) {
          throw new TypeError(`Missing timer for player ${String(playerId)}.`);
        }
        return [playerId, { ...timer, isRunning: false }] as const;
      }),
    ),
    ...(state.timers.disconnects === undefined
      ? {}
      : {
          disconnects: Object.fromEntries(
            (Object.keys(state.timers.disconnects) as PlayerId[]).map(
              (playerId) => {
                const timer = state.timers.disconnects?.[playerId];
                if (timer === undefined) {
                  throw new TypeError(
                    `Missing disconnect timer for player ${String(playerId)}.`,
                  );
                }
                return [playerId, { ...timer, isRunning: false }] as const;
              },
            ),
          ),
        }),
  },
});

export const applyLocalDevMatchTimerExpiries = (
  match: LocalDevMatch,
  expiries: readonly MatchTimerExpiry[],
): void => {
  const expiry = expiries[0];
  if (expiry === undefined) {
    return;
  }
  const previousState = cloneGameState(match.state);
  const result = applyAction(match.state, {
    type: "concede",
    playerId: expiry.playerId,
  });
  if (result.errors !== undefined) {
    return;
  }
  match.state = stopAllTimers(result.state);
  match.rollback = recordRollbackPoint(
    match.rollback,
    previousState,
    result.events,
  );
};
