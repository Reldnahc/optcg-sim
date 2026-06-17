import type { MatchId } from "@optcg/types";

import {
  createMatchSessionRuntime,
  type MatchSessionRuntime,
} from "./match-session.js";
import { createInMemoryMatchSessionStore } from "./match-session-store.js";
import type {
  ClientActionEnvelope,
  MatchPersistence,
  MatchRecoveryContext,
  MatchSessionMetadata,
  SessionActionResult,
  SessionObservation,
  StoredSessionRecord,
} from "./session-types.js";
import type { LocalDevMatch } from "./local-match.js";

interface SessionClock {
  readonly nowIso: () => string;
  readonly nowMs: () => number;
}

export interface RegisterLocalDevMatchInput {
  readonly local: LocalDevMatch;
  readonly metadata: MatchSessionMetadata;
  readonly persistence?: MatchPersistence;
  readonly initialRecords?: {
    readonly actions?: readonly StoredSessionRecord[];
    readonly decisions?: readonly StoredSessionRecord[];
  };
  readonly recoveryContext?: () => MatchRecoveryContext | undefined;
  readonly includeActionSnapshots?: boolean;
}

export interface CreateMatchSessionServiceOptions {
  readonly clock?: SessionClock;
  readonly observe?: (observation: SessionObservation) => void;
}

export interface MatchSessionService {
  registerLocalDevMatch(input: RegisterLocalDevMatchInput): MatchSessionRuntime;
  applyEnvelope(envelope: ClientActionEnvelope): SessionActionResult;
  flushPersistence(matchId: MatchId): Promise<void>;
  saveSnapshot(matchId: MatchId): Promise<void>;
  getRuntime(matchId: MatchId): MatchSessionRuntime | undefined;
}

const systemClock = (): SessionClock => ({
  nowIso: () => new Date().toISOString(),
  nowMs: () => performance.now(),
});

const missingSessionResult = (
  envelope: ClientActionEnvelope,
): SessionActionResult => ({
  type: "actionResult",
  matchId: envelope.matchId,
  clientActionId: envelope.clientActionId,
  accepted: false,
  stateSeq: envelope.expectedStateSeq,
  reason: "matchFrozen",
  errors: ["Match session is not active on this server."],
});

export const createMatchSessionService = ({
  clock = systemClock(),
  observe,
}: CreateMatchSessionServiceOptions = {}): MatchSessionService => {
  const sessions = createInMemoryMatchSessionStore<MatchSessionRuntime>();

  const recordObservation = (
    envelope: ClientActionEnvelope,
    result: SessionActionResult,
    startedAt: number,
  ): void => {
    observe?.({
      matchId: envelope.matchId,
      clientActionId: envelope.clientActionId,
      requestType: envelope.request.type,
      accepted: result.accepted,
      ...(result.reason === undefined ? {} : { reason: result.reason }),
      stateSeq: result.stateSeq,
      ...(result.actionSeq === undefined
        ? {}
        : { actionSeq: result.actionSeq }),
      durationMs: Math.max(0, clock.nowMs() - startedAt),
    });
  };

  return {
    registerLocalDevMatch({
      local,
      metadata,
      persistence,
      initialRecords,
      recoveryContext,
      includeActionSnapshots,
    }) {
      const runtime = createMatchSessionRuntime({
        local,
        metadata,
        ...(persistence === undefined ? {} : { persistence }),
        ...(initialRecords === undefined ? {} : { initialRecords }),
        ...(recoveryContext === undefined ? {} : { recoveryContext }),
        ...(includeActionSnapshots === undefined
          ? {}
          : { includeActionSnapshots }),
        now: clock.nowIso,
      });
      sessions.set(metadata.matchId, runtime);
      return runtime;
    },
    applyEnvelope(envelope) {
      const startedAt = clock.nowMs();
      const runtime = sessions.get(envelope.matchId);
      const result =
        runtime === undefined
          ? missingSessionResult(envelope)
          : runtime.applyEnvelope(envelope);
      recordObservation(envelope, result, startedAt);
      return result;
    },
    async flushPersistence(matchId) {
      await sessions.get(matchId)?.flushPersistence();
    },
    async saveSnapshot(matchId) {
      await sessions.get(matchId)?.saveSnapshot();
    },
    getRuntime(matchId) {
      return sessions.get(matchId);
    },
  };
};
