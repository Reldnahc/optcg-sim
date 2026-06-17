import type { Duplex } from "node:stream";
import type { MatchId, PlayerId } from "@optcg/types";

import type { LocalDevMatchRegistry } from "./dev-local-match-registry.js";
import { connectedPlayerIdsForMatch } from "./dev-match-connection-state.js";

interface MatchSocketConnection {
  readonly matchId: MatchId;
  readonly playerId: PlayerId;
  readonly socket: Pick<Duplex, "destroyed" | "writableEnded">;
}

type MatchTimerAdvanceOptions = Parameters<
  LocalDevMatchRegistry["advanceTimers"]
>[0];
type MatchTimerAdvanceResult = ReturnType<
  LocalDevMatchRegistry["advanceTimers"]
>;

interface MatchTimerRegistry {
  readonly advanceTimers: (
    options: MatchTimerAdvanceOptions,
  ) => MatchTimerAdvanceResult;
}

interface AdvanceMatchTimersAndBroadcastSafelyOptions {
  readonly registry: MatchTimerRegistry;
  readonly connections: Set<MatchSocketConnection>;
  readonly elapsedMs: number;
  readonly broadcast: (matchId: MatchId, sync: "state" | "timers") => void;
  readonly matchIds?: readonly MatchId[];
  readonly afterAdvance?: () => void;
  readonly onError?: (error: unknown) => void;
}

interface SerializedMatchTimerAdvanceSchedulerOptions {
  readonly advance: (elapsedMs: number) => Promise<void>;
  readonly now?: () => number;
  readonly onError?: (error: unknown) => void;
}

interface SerializedMatchTimerAdvanceScheduler {
  readonly tick: () => void;
}

const ignoreAsyncError = (): void => undefined;

const reportAsyncError = (
  error: unknown,
  onError: (error: unknown) => void,
): void => {
  try {
    onError(error);
  } catch {
    // Keep background timer error reporting from becoming another unhandled error.
  }
};

export const advanceMatchTimersAndBroadcast = async (
  registry: MatchTimerRegistry,
  connections: Set<MatchSocketConnection>,
  elapsedMs: number,
  broadcast: (matchId: MatchId, sync: "state" | "timers") => void,
  matchIds?: readonly MatchId[],
): Promise<void> => {
  const changedMatches = await registry.advanceTimers({
    elapsedMs,
    connectedPlayerIds: (matchId) =>
      connectedPlayerIdsForMatch(matchId, connections),
    ...(matchIds === undefined ? {} : { matchIds }),
  });
  for (const changed of changedMatches) {
    broadcast(changed.matchId, changed.sync);
  }
};

export const advanceMatchTimersAndBroadcastSafely = ({
  registry,
  connections,
  elapsedMs,
  broadcast,
  matchIds,
  afterAdvance,
  onError = ignoreAsyncError,
}: AdvanceMatchTimersAndBroadcastSafelyOptions): void => {
  void advanceMatchTimersAndBroadcast(
    registry,
    connections,
    elapsedMs,
    broadcast,
    matchIds,
  )
    .then(() => {
      afterAdvance?.();
    })
    .catch((error: unknown) => {
      reportAsyncError(error, onError);
    });
};

export const createSerializedMatchTimerAdvanceScheduler = ({
  advance,
  now = Date.now,
  onError = ignoreAsyncError,
}: SerializedMatchTimerAdvanceSchedulerOptions): SerializedMatchTimerAdvanceScheduler => {
  let lastTickMs = now();
  let pendingElapsedMs = 0;
  let running = false;

  const flush = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    try {
      while (pendingElapsedMs > 0) {
        const elapsedMs = pendingElapsedMs;
        pendingElapsedMs = 0;
        try {
          await advance(elapsedMs);
        } catch (error) {
          reportAsyncError(error, onError);
        }
      }
    } finally {
      running = false;
      if (pendingElapsedMs > 0) {
        void flush();
      }
    }
  };

  return {
    tick() {
      const currentTickMs = now();
      const elapsedMs = Math.max(0, currentTickMs - lastTickMs);
      lastTickMs = currentTickMs;
      if (elapsedMs <= 0) {
        return;
      }
      pendingElapsedMs += elapsedMs;
      void flush();
    },
  };
};
