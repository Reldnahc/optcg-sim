import { describe, expect, test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";

import { requestHash } from "./action-envelope.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import { createLocalDevMatch } from "./local-match.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import { createMatchSessionRuntime } from "./match-session.js";
import type {
  ClientActionEnvelope,
  MatchSessionMetadata,
  SessionActionRequest,
} from "./session-types.js";

const matchId = "session-runtime-match" as MatchId;
const p1 = "p1" as PlayerId;

const submitRequest = (
  stateSeq: number,
  actionIndex = 0,
): SessionActionRequest => ({
  type: "submitAction",
  playerId: p1,
  actionIndex,
  expectedStateSeq: stateSeq,
});

const envelope = (
  request: SessionActionRequest,
  expectedStateSeq: number,
  clientActionId = "client-action-1",
): ClientActionEnvelope => ({
  protocolVersion: "dev",
  matchId,
  playerId: request.playerId,
  clientActionId,
  expectedStateSeq,
  requestHash: requestHash(request),
  request,
});

const createRuntime = async () => {
  const setup = await createFixtureDevMatchSetup(matchId);
  const local = createLocalDevMatch(setup);
  return { local, runtime: createMatchSessionRuntime({ local }) };
};

const metadata = (): MatchSessionMetadata => ({
  matchId,
  gameType: "dev",
  formatId: "dev",
  createdAt: "2026-05-30T00:00:00.000Z",
  playerIds: ["p1" as PlayerId, "p2" as PlayerId],
  creationSource: { type: "dev" },
  disconnectPolicyMode: "dev-none",
  rollbackPolicyMode: "mutual-consent",
  spectatorPolicyMode: "live-filtered",
  firstPlayerChoice: {
    source: "game-one-random-chooser",
    chooserPlayerId: p1,
  },
});

describe("match session runtime", () => {
  test("returns the same result for duplicate client action id and hash", async () => {
    const { local, runtime } = await createRuntime();
    const input = envelope(submitRequest(local.state.seq), local.state.seq);

    const first = runtime.applyEnvelope(input);
    const second = runtime.applyEnvelope(input);

    expect(second).toEqual(first);
  });

  test("rejects duplicate client action id with different request hash", async () => {
    const { local, runtime } = await createRuntime();
    const input = envelope(submitRequest(local.state.seq), local.state.seq);
    runtime.applyEnvelope(input);

    const second = runtime.applyEnvelope({
      ...input,
      requestHash: "different",
    });

    expect(second.accepted).toBe(false);
    expect(second.reason).toBe("idempotencyConflict");
  });

  test("does not expose raw GameState in action results", async () => {
    const { local, runtime } = await createRuntime();
    const result = runtime.applyEnvelope(
      envelope(submitRequest(local.state.seq), local.state.seq),
    );

    expect("state" in result).toBe(false);
    expect(result.snapshot?.players).toBeDefined();
  });

  test("rejects stale and future envelopes before local application", async () => {
    const { local, runtime } = await createRuntime();
    const stale = envelope(
      submitRequest(local.state.seq - 1),
      local.state.seq - 1,
      "stale-action",
    );
    const future = envelope(
      submitRequest(local.state.seq + 1),
      local.state.seq + 1,
      "future-action",
    );

    expect(runtime.applyEnvelope(stale).reason).toBe("staleState");
    expect(runtime.applyEnvelope(future).reason).toBe("futureState");
    expect(local.state.seq).toBe(stale.expectedStateSeq + 1);
  });

  test("persists accepted records and server-only snapshots", async () => {
    const setup = await createFixtureDevMatchSetup(matchId);
    const local = createLocalDevMatch(setup);
    const persistence = createInMemoryMatchPersistence();
    const runtime = createMatchSessionRuntime({
      local,
      metadata: metadata(),
      persistence,
    });
    const input = envelope(submitRequest(local.state.seq), local.state.seq);

    runtime.applyEnvelope(input);
    runtime.applyEnvelope(input);
    runtime.applyEnvelope(
      envelope(
        submitRequest(input.expectedStateSeq - 1),
        input.expectedStateSeq - 1,
        "stale-action",
      ),
    );
    await runtime.flushPersistence();
    await runtime.saveSnapshot();

    const loaded = await persistence.loadSnapshot(matchId);
    expect(loaded?.actions).toHaveLength(1);
    expect(loaded?.decisions).toHaveLength(0);
    expect(loaded?.state.matchId).toBe(matchId);
    expect(loaded?.manifest.manifestHash).toBe(
      local.state.cardManifest.manifestHash,
    );
  });
});
