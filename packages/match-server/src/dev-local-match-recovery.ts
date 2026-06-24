import { createRecoveredLocalDevMatch } from "./local-match.js";
import { replayDeterministicRecoveryEntries } from "./deterministic-recovery.js";
import type { MatchSessionService } from "./session-service.js";
import type {
  MatchPersistence,
  MatchPersistenceSnapshot,
} from "./session-types.js";
import {
  activeMatchRecoveryContext,
  type ActiveLocalDevMatchSession,
} from "./dev-local-match-session-factory.js";

export interface RecoverPersistedLocalDevMatchSessionsInput {
  readonly matchPersistence: MatchPersistence;
  readonly sessionService: MatchSessionService;
  readonly recoveryOwnerInstanceId: string;
  readonly recoveryLockTtlMs: number;
  readonly includeActionSnapshots?: boolean;
}

const recoverActiveSession = ({
  includeActionSnapshots,
  matchPersistence,
  sessionService,
  snapshot,
}: {
  readonly snapshot: MatchPersistenceSnapshot;
  readonly matchPersistence: MatchPersistence;
  readonly sessionService: MatchSessionService;
  readonly includeActionSnapshots?: boolean;
}): ActiveLocalDevMatchSession | string => {
  const context = snapshot.recoveryContext;
  if (context === undefined) {
    return "recovery context missing";
  }
  const match = createRecoveredLocalDevMatch({
    state: snapshot.state,
    rollback: context.rollback,
    cardVariantOverrides: context.cardVariantOverrides,
  });
  const replayError = replayDeterministicRecoveryEntries(match, snapshot);
  if (replayError !== undefined) {
    return replayError;
  }
  const session: ActiveLocalDevMatchSession = {
    status: "active",
    match,
    setup: context.setup,
    seats: structuredClone(context.seats),
    firstPlayerChoice: context.firstPlayerChoice,
    timersEnabled: context.timersEnabled,
    botPlayerIds: new Set(context.botPlayerIds),
  };
  sessionService.registerLocalDevMatch({
    local: match,
    metadata: snapshot.metadata,
    persistence: matchPersistence,
    initialRecords: {
      actions: snapshot.actions,
      decisions: snapshot.decisions,
    },
    recoveryContext: () => activeMatchRecoveryContext(session),
    ...(includeActionSnapshots === undefined ? {} : { includeActionSnapshots }),
  });
  return session;
};

export const recoverPersistedLocalDevMatchSessions = async ({
  includeActionSnapshots,
  matchPersistence,
  recoveryLockTtlMs,
  recoveryOwnerInstanceId,
  sessionService,
}: RecoverPersistedLocalDevMatchSessionsInput): Promise<
  ActiveLocalDevMatchSession[]
> => {
  const recoveredSessions: ActiveLocalDevMatchSession[] = [];
  for (const matchId of await matchPersistence.listActiveMatchIds()) {
    const now = new Date().toISOString();
    const lock = await matchPersistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId: recoveryOwnerInstanceId,
      now,
      ttlMs: recoveryLockTtlMs,
    });
    if (lock === undefined) {
      continue;
    }
    try {
      const snapshot = await matchPersistence.loadSnapshot(matchId);
      if (snapshot === undefined) {
        await matchPersistence.freezeMatch({
          matchId,
          reason: "recovery snapshot missing",
          frozenAt: now,
        });
        continue;
      }
      const recovered = recoverActiveSession({
        snapshot,
        matchPersistence,
        sessionService,
        ...(includeActionSnapshots === undefined
          ? {}
          : { includeActionSnapshots }),
      });
      if (typeof recovered === "string") {
        await matchPersistence.freezeMatch({
          matchId,
          reason: recovered,
          frozenAt: now,
        });
        continue;
      }
      recoveredSessions.push(recovered);
    } finally {
      await matchPersistence.releaseRecoveryLock({ lock });
    }
  }
  return recoveredSessions;
};
