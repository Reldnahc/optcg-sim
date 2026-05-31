import { describe, expect, test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";

import { requestHash } from "./action-envelope.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import { createLocalDevMatch } from "./local-match.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import type {
  ClientActionEnvelope,
  MatchSessionMetadata,
  StoredSessionRecord,
} from "./session-types.js";

const matchId = "persisted-match" as MatchId;
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

const actionRecord = (clientActionId: string): StoredSessionRecord => {
  const request = {
    type: "submitAction" as const,
    playerId: p1,
    actionIndex: 0,
    expectedStateSeq: 1,
  };
  const envelope: ClientActionEnvelope = {
    protocolVersion: "dev",
    matchId,
    playerId: p1,
    clientActionId,
    expectedStateSeq: 1,
    requestHash: requestHash(request),
    request,
  };
  return {
    envelope,
    recordedAt: "2026-05-30T00:00:01.000Z",
    result: {
      type: "actionResult",
      matchId,
      clientActionId,
      accepted: true,
      stateSeq: 2,
      actionSeq: 1,
      errors: [],
    },
  };
};

describe("in-memory match persistence", () => {
  test("saves server-only snapshots and keeps metadata immutable", async () => {
    const setup = await createFixtureDevMatchSetup(matchId);
    const local = createLocalDevMatch(setup);
    const persistence = createInMemoryMatchPersistence();
    const mutableMetadata = metadata();

    await persistence.saveSnapshot({
      metadata: mutableMetadata,
      state: local.state,
      manifest: setup.cardManifest,
      actions: [],
      decisions: [],
    });
    (mutableMetadata.playerIds as PlayerId[]).push("p3" as PlayerId);

    const loaded = await persistence.loadSnapshot(matchId);

    expect(loaded?.metadata.playerIds).toEqual([p1, p2]);
    expect(loaded?.state.matchId).toBe(matchId);
    expect(loaded?.manifest.manifestHash).toBe(setup.cardManifest.manifestHash);
  });

  test("appends action and decision records and lists active matches", async () => {
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

    await persistence.appendAction({
      matchId,
      record: actionRecord("action-1"),
    });
    await persistence.appendDecision({
      matchId,
      record: actionRecord("decision-1"),
    });

    const loaded = await persistence.loadSnapshot(matchId);
    expect(await persistence.listActiveMatchIds()).toEqual([matchId]);
    expect(
      loaded?.actions.map((record) => record.envelope.clientActionId),
    ).toEqual(["action-1"]);
    expect(
      loaded?.decisions.map((record) => record.envelope.clientActionId),
    ).toEqual(["decision-1"]);
  });

  test("acquires recovery lock by owner ttl and records freezes", async () => {
    const persistence = createInMemoryMatchPersistence();

    const first = await persistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId: "owner-a",
      now: "2026-05-30T00:00:00.000Z",
      ttlMs: 1000,
    });
    const blocked = await persistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId: "owner-b",
      now: "2026-05-30T00:00:00.500Z",
      ttlMs: 1000,
    });
    const afterExpiry = await persistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId: "owner-b",
      now: "2026-05-30T00:00:01.001Z",
      ttlMs: 1000,
    });
    await persistence.freezeMatch({
      matchId,
      reason: "missing snapshot",
      frozenAt: "2026-05-30T00:00:02.000Z",
    });

    expect(first?.ownerInstanceId).toBe("owner-a");
    expect(blocked).toBeUndefined();
    expect(afterExpiry?.ownerInstanceId).toBe("owner-b");
    expect(persistence.freezeRecords()).toEqual([
      {
        matchId,
        reason: "missing snapshot",
        frozenAt: "2026-05-30T00:00:02.000Z",
      },
    ]);
  });
});
