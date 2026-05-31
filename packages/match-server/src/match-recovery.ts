import type { MatchId } from "@optcg/types";

import type { MatchPersistence } from "./session-types.js";

export interface RecoverActiveMatchesInput {
  readonly persistence: MatchPersistence;
  readonly ownerInstanceId: string;
  readonly now: string;
  readonly lockTtlMs?: number;
}

export interface RecoveredMatchSummary {
  readonly matchId: MatchId;
  readonly stateSeq: number;
  readonly actionCount: number;
  readonly decisionCount: number;
}

export const recoverActiveMatches = async ({
  persistence,
  ownerInstanceId,
  now,
  lockTtlMs = 30_000,
}: RecoverActiveMatchesInput): Promise<RecoveredMatchSummary[]> => {
  const recovered: RecoveredMatchSummary[] = [];
  for (const matchId of await persistence.listActiveMatchIds()) {
    const lock = await persistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId,
      now,
      ttlMs: lockTtlMs,
    });
    if (lock === undefined) {
      continue;
    }
    const snapshot = await persistence.loadSnapshot(matchId);
    if (snapshot === undefined) {
      await persistence.freezeMatch({
        matchId,
        reason: "recovery snapshot missing",
        frozenAt: now,
      });
      continue;
    }
    recovered.push({
      matchId,
      stateSeq: snapshot.state.seq,
      actionCount: snapshot.actions.length,
      decisionCount: snapshot.decisions.length,
    });
    await persistence.releaseRecoveryLock({ matchId, ownerInstanceId });
  }
  return recovered;
};
