import { describe, expect, test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";

import { requestHash } from "./action-envelope.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import { createLocalDevMatch } from "./local-match.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import { createMatchSessionService } from "./session-service.js";
import type {
  ClientActionEnvelope,
  MatchSessionMetadata,
  SessionActionRequest,
  SessionObservation,
} from "./session-types.js";

const matchId = "session-service-match" as MatchId;
const p1 = "p1" as PlayerId;

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
    choice: "goFirst",
    resolvedFirstPlayerId: p1,
  },
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

describe("match session service", () => {
  test("applies registered session envelopes and records safe observations", async () => {
    const setup = await createFixtureDevMatchSetup(matchId);
    const local = createLocalDevMatch(setup);
    const observations: SessionObservation[] = [];
    const service = createMatchSessionService({
      clock: {
        nowIso: () => "2026-05-30T00:00:00.000Z",
        nowMs: () => 100,
      },
      observe: (observation) => observations.push(observation),
    });
    service.registerLocalDevMatch({ local, metadata: metadata() });
    const request: SessionActionRequest = {
      type: "submitAction",
      playerId: p1,
      actionIndex: 0,
      expectedStateSeq: local.state.seq,
    };

    const result = service.applyEnvelope(envelope(request, local.state.seq));

    expect(result.accepted).toBe(true);
    expect(observations).toEqual([
      {
        matchId,
        clientActionId: "client-action-1",
        requestType: "submitAction",
        accepted: true,
        stateSeq: result.stateSeq,
        actionSeq: result.actionSeq,
        durationMs: 0,
      },
    ]);
    expect(JSON.stringify(observations)).not.toContain("cardManifest");
    expect(JSON.stringify(observations)).not.toContain("players");
  });

  test("flushes accepted records through the registered runtime", async () => {
    const setup = await createFixtureDevMatchSetup(matchId);
    const local = createLocalDevMatch(setup);
    const persistence = createInMemoryMatchPersistence();
    const service = createMatchSessionService();
    service.registerLocalDevMatch({
      local,
      metadata: metadata(),
      persistence,
    });
    const request: SessionActionRequest = {
      type: "submitAction",
      playerId: p1,
      actionIndex: 0,
      expectedStateSeq: local.state.seq,
    };

    service.applyEnvelope(envelope(request, local.state.seq));
    await service.flushPersistence(matchId);
    await service.saveSnapshot(matchId);

    const loaded = await persistence.loadSnapshot(matchId);
    expect(loaded?.actions).toHaveLength(1);
  });

  test("fails closed for missing sessions", () => {
    const service = createMatchSessionService();
    const request: SessionActionRequest = {
      type: "submitAction",
      playerId: p1,
      actionIndex: 0,
      expectedStateSeq: 1,
    };

    const result = service.applyEnvelope(envelope(request, 1));

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("matchFrozen");
  });
});
