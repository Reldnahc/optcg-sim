import { describe, expect, test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";

import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import { createLocalDevMatch } from "./local-match.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import { recoverActiveMatches } from "./match-recovery.js";
import type {
  MatchPersistence,
  MatchSessionMetadata,
} from "./session-types.js";

const matchId = "recoverable-match" as MatchId;
const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const metadata = (): MatchSessionMetadata => ({
  matchId,
  gameType: "dev",
  formatId: "dev",
  createdAt: "2026-05-30T00:00:00.000Z",
  playerIds: [p1, p2],
  creationSource: { type: "dev" },
  disconnectPolicyMode: "dev-none",
  rollbackPolicyMode: "mutual-consent",
  spectatorPolicyMode: "live-filtered",
  firstPlayerChoice: {
    source: "game-one-random-chooser",
    chooserPlayerId: p1,
  },
});

describe("active match recovery", () => {
  test("empty persistence returns no recovered matches", async () => {
    const persistence = createInMemoryMatchPersistence();

    await expect(
      recoverActiveMatches({
        persistence,
        ownerInstanceId: "owner-a",
        now: "2026-05-30T00:00:00.000Z",
      }),
    ).resolves.toEqual([]);
  });

  test("listed match with no snapshot freezes the match", async () => {
    const frozen: Array<{ matchId: MatchId; reason: string }> = [];
    const persistence: MatchPersistence = {
      saveSnapshot: () => Promise.resolve(),
      appendDeterministicEntry: () => Promise.resolve(),
      appendDeterministicCheckpoint: () => Promise.resolve(),
      appendAction: () => Promise.resolve(),
      appendDecision: () => Promise.resolve(),
      loadSnapshot: () => Promise.resolve(undefined),
      listActiveMatchIds: () => Promise.resolve([matchId]),
      tryAcquireRecoveryLock: ({ ownerInstanceId, now, ttlMs }) =>
        Promise.resolve({
          matchId,
          ownerInstanceId,
          acquiredAt: now,
          expiresAt: new Date(Date.parse(now) + ttlMs).toISOString(),
        }),
      releaseRecoveryLock: () => Promise.resolve(),
      freezeMatch: ({ matchId: frozenMatchId, reason }) => {
        frozen.push({ matchId: frozenMatchId, reason });
        return Promise.resolve();
      },
    };

    const recovered = await recoverActiveMatches({
      persistence,
      ownerInstanceId: "owner-a",
      now: "2026-05-30T00:00:00.000Z",
    });

    expect(recovered).toEqual([]);
    expect(frozen).toEqual([{ matchId, reason: "recovery snapshot missing" }]);
  });

  test("lock acquisition failure skips the match without freezing", async () => {
    const frozen: unknown[] = [];
    const persistence: MatchPersistence = {
      saveSnapshot: () => Promise.resolve(),
      appendDeterministicEntry: () => Promise.resolve(),
      appendDeterministicCheckpoint: () => Promise.resolve(),
      appendAction: () => Promise.resolve(),
      appendDecision: () => Promise.resolve(),
      loadSnapshot: () => Promise.resolve(undefined),
      listActiveMatchIds: () => Promise.resolve([matchId]),
      tryAcquireRecoveryLock: () => Promise.resolve(undefined),
      releaseRecoveryLock: () => Promise.resolve(),
      freezeMatch: (input) => {
        frozen.push(input);
        return Promise.resolve();
      },
    };

    const recovered = await recoverActiveMatches({
      persistence,
      ownerInstanceId: "owner-a",
      now: "2026-05-30T00:00:00.000Z",
    });

    expect(recovered).toEqual([]);
    expect(frozen).toEqual([]);
  });

  test("valid snapshot returns shallow recovered summary and releases lock", async () => {
    const setup = await createFixtureDevMatchSetup(matchId);
    const local = createLocalDevMatch(setup);
    const persistence = createInMemoryMatchPersistence();
    await persistence.saveSnapshot({
      metadata: metadata(),
      state: local.state,
      manifest: setup.cardManifest,
      actions: [],
      decisions: [],
    });

    const recovered = await recoverActiveMatches({
      persistence,
      ownerInstanceId: "owner-a",
      now: "2026-05-30T00:00:00.000Z",
    });

    expect(recovered).toEqual([
      {
        matchId,
        stateSeq: local.state.seq,
        actionCount: 0,
        decisionCount: 0,
      },
    ]);
  });
});
