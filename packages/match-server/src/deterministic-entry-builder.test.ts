import { describe, expect, test } from "vitest";
import type { Action, MatchId, PlayerId, StateSeq } from "@optcg/types";

import { requestHash } from "./action-envelope.js";
import { buildStoredDeterministicSessionRecord } from "./deterministic-entry-builder.js";
import type {
  ClientActionEnvelope,
  SessionActionResult,
} from "./session-types.js";

const matchId = "deterministic-record-match" as MatchId;
const playerId = "p1" as PlayerId;
const action: Action = { type: "endMainPhase" };

const envelope = (): ClientActionEnvelope => {
  const request = {
    type: "submitAction",
    playerId,
    actionIndex: 0,
    expectedStateSeq: 3,
  } as const;
  return {
    protocolVersion: "dev",
    matchId,
    playerId,
    clientActionId: "client-action-1",
    expectedStateSeq: 3,
    requestHash: requestHash(request),
    request,
  };
};

const result = (): SessionActionResult => ({
  type: "actionResult",
  matchId,
  clientActionId: "client-action-1",
  accepted: true,
  stateSeq: 4,
  actionSeq: 9,
  errors: [],
});

describe("buildStoredDeterministicSessionRecord", () => {
  test("stores exact deterministic action authority separately from client audit", () => {
    const inputEnvelope = envelope();

    const record = buildStoredDeterministicSessionRecord({
      matchId,
      entrySeq: 0,
      envelope: inputEnvelope,
      result: result(),
      deterministicOperation: { kind: "action", action },
      stateSeqBefore: 3 as StateSeq,
      actionSeqBefore: 8,
      stateHashBefore: "before-hash",
      stateSeqAfter: 4 as StateSeq,
      actionSeqAfter: 9,
      stateHashAfter: "after-hash",
      recordedAt: "2026-06-24T00:00:00.000Z",
    });

    expect(record.deterministicEntry).toEqual({
      formatVersion: "deterministic-entry-v1",
      matchId,
      entrySeq: 0,
      kind: "action",
      playerId,
      action,
      verification: {
        stateSeqBefore: 3,
        actionSeqBefore: 8,
        stateHashBefore: "before-hash",
        stateSeqAfter: 4,
        actionSeqAfter: 9,
        stateHashAfter: "after-hash",
        hashScope: "gameplay-v1",
      },
    });
    expect("envelope" in record.deterministicEntry).toBe(false);
    expect(record.audit.type).toBe("clientEnvelope");
    expect(record.audit.envelope.clientActionId).toBe(
      inputEnvelope.clientActionId,
    );
  });
});
