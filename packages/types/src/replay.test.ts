import { describe, expect, test } from "vitest";
import type {
  DeterministicCheckpoint,
  DeterministicMatchEntry,
} from "./replay.js";
import type { MatchId, PlayerId, StateSeq } from "./primitives.js";

describe("replay shared types", () => {
  test("represents deterministic action entries without transport envelopes", () => {
    const entry: DeterministicMatchEntry = {
      formatVersion: "deterministic-entry-v1",
      matchId: "match-1" as MatchId,
      entrySeq: 0,
      kind: "action",
      playerId: "player-1" as PlayerId,
      action: { type: "endMainPhase" },
      verification: {
        stateSeqBefore: 1 as StateSeq,
        actionSeqBefore: 0,
        stateHashBefore: "before",
        stateSeqAfter: 2 as StateSeq,
        actionSeqAfter: 1,
        stateHashAfter: "after",
        hashScope: "gameplay-v1",
      },
    };

    expect(entry.kind).toBe("action");
  });

  test("represents rollback checkpoints with optional snapshots", () => {
    const checkpoint: DeterministicCheckpoint = {
      checkpointVersion: "deterministic-checkpoint-v1",
      matchId: "match-1" as MatchId,
      checkpointId: "rollback:1:0:event-1",
      reason: "rollbackPoint",
      stateSeq: 1 as StateSeq,
      actionSeq: 0,
      stateHash: "hash",
      hashScope: "gameplay-v1",
    };

    expect(checkpoint.reason).toBe("rollbackPoint");
  });
});
