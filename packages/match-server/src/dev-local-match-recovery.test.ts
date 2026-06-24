import { strict as assert } from "node:assert";
import { test } from "vitest";

import { hashCanonicalStateValue } from "@optcg/engine-core";
import type { MatchId, StateSeq } from "@optcg/types";

import { requestHash } from "./action-envelope.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import { recoverPersistedLocalDevMatchSessions } from "./dev-local-match-recovery.js";
import { createLocalSeats } from "./dev-local-match-session-factory.js";
import { devSessionMetadata } from "./dev-session-metadata.js";
import {
  applyLocalDevDecision,
  createLocalDevMatch,
} from "./local-match.js";
import { createMatchSessionService } from "./session-service.js";
import type {
  MatchPersistence,
  MatchPersistenceSnapshot,
  SessionActionRequest,
} from "./session-types.js";

test("recovers from deterministic entries without re-resolving audit envelope action indexes", async () => {
  const matchId = "deterministic-recovery-match" as MatchId;
  const setup = await createFixtureDevMatchSetup(matchId);
  const match = createLocalDevMatch(setup);
  const decision = match.state.pendingDecision;
  if (decision === undefined) {
    throw new Error("Expected setup decision.");
  }
  const response = { type: "cards" as const, cards: [] };
  const snapshotState = structuredClone(match.state);
  const expected = createLocalDevMatch(setup);
  const applied = applyLocalDevDecision(expected, {
    playerId: decision.playerId,
    decisionId: decision.id,
    response,
    includeSnapshot: false,
  });
  const impossibleRequest: SessionActionRequest = {
    type: "submitAction",
    playerId: decision.playerId,
    actionIndex: 9999,
    expectedStateSeq: snapshotState.seq,
  };
  const recordedAt = "2026-06-08T00:00:01.000Z";
  const snapshot: MatchPersistenceSnapshot = {
    metadata: devSessionMetadata(setup, {
      source: "game-one-random-chooser",
      chooserPlayerId: setup.firstPlayerId,
      choice: "goFirst",
      resolvedFirstPlayerId: setup.firstPlayerId,
    }),
    state: snapshotState,
    manifest: snapshotState.cardManifest,
    recoveryContext: {
      setup,
      seats: createLocalSeats(setup),
      firstPlayerChoice: {
        source: "game-one-random-chooser" as const,
        chooserPlayerId: setup.firstPlayerId,
        choice: "goFirst" as const,
        resolvedFirstPlayerId: setup.firstPlayerId,
      },
      timersEnabled: false,
      botPlayerIds: [],
      rollback: match.rollback,
      cardVariantOverrides: {},
    },
    deterministicLogVersion: "deterministic-entry-v1",
    deterministicEntriesSinceSnapshot: [
      {
        deterministicEntry: {
          formatVersion: "deterministic-entry-v1",
          matchId,
          entrySeq: 0,
          kind: "decision",
          playerId: decision.playerId,
          decisionId: decision.id,
          response,
          verification: {
            stateSeqBefore: snapshotState.seq,
            actionSeqBefore: snapshotState.actionSeq,
            stateHashBefore: hashCanonicalStateValue(snapshotState),
            stateSeqAfter: applied.stateSeq as StateSeq,
            actionSeqAfter: applied.actionSeq,
            stateHashAfter: hashCanonicalStateValue(expected.state),
            hashScope: "gameplay-v1",
          },
        },
        audit: {
          type: "clientEnvelope",
          envelope: {
            protocolVersion: "dev-http-v1",
            matchId,
            playerId: decision.playerId,
            clientActionId: "stale-audit-envelope",
            expectedStateSeq: snapshotState.seq,
            requestHash: requestHash(impossibleRequest),
            request: impossibleRequest,
          },
          result: {
            type: "actionResult",
            matchId,
            clientActionId: "stale-audit-envelope",
            accepted: true,
            stateSeq: applied.stateSeq,
            actionSeq: applied.actionSeq,
            errors: [],
          },
          recordedAt,
        },
      },
    ],
    actions: [
      {
        envelope: {
          protocolVersion: "dev-http-v1",
          matchId,
          playerId: decision.playerId,
          clientActionId: "stale-audit-envelope",
          expectedStateSeq: snapshotState.seq,
          requestHash: requestHash(impossibleRequest),
          request: impossibleRequest,
        },
        result: {
          type: "actionResult" as const,
          matchId,
          clientActionId: "stale-audit-envelope",
          accepted: true,
          stateSeq: applied.stateSeq,
          actionSeq: applied.actionSeq,
          errors: [],
        },
        recordedAt,
      },
    ],
    decisions: [],
  };
  let freezeReason: string | undefined;
  const persistence: MatchPersistence = {
    saveSnapshot() {
      return Promise.resolve();
    },
    appendDeterministicEntry() {
      return Promise.resolve();
    },
    appendAction() {
      return Promise.resolve();
    },
    appendDecision() {
      return Promise.resolve();
    },
    loadSnapshot() {
      return Promise.resolve(snapshot);
    },
    listActiveMatchIds() {
      return Promise.resolve([matchId]);
    },
    tryAcquireRecoveryLock({ ownerInstanceId, now, ttlMs }) {
      return Promise.resolve({
        matchId,
        ownerInstanceId,
        acquiredAt: now,
        expiresAt: new Date(Date.parse(now) + ttlMs).toISOString(),
      });
    },
    releaseRecoveryLock() {
      return Promise.resolve();
    },
    freezeMatch(input) {
      freezeReason = input.reason;
      return Promise.resolve();
    },
  };

  const recovered = await recoverPersistedLocalDevMatchSessions({
    matchPersistence: persistence,
    sessionService: createMatchSessionService(),
    recoveryOwnerInstanceId: "test-recovery",
    recoveryLockTtlMs: 1_000,
  });

  assert.equal(freezeReason, undefined);
  assert.equal(recovered[0]?.status, "active");
  assert.equal(recovered[0]?.match.state.seq, applied.stateSeq);
});
