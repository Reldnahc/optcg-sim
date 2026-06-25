import { describe, expect, test } from "vitest";
import type {
  DeterministicMatchEntry,
  GameState,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import { reconstructReplayArtifactStates } from "./artifact-reducer.js";
import { makeMainPhaseLegalActionState } from "../action-dispatcher-test-support.js";
import { applyDeterministicOperation } from "./deterministic-operation.js";
import { hashReplayStateForScope } from "./deterministic-entry.js";
import { replayEntryAfterCheckpointId } from "./deterministic-checkpoint-ids.js";

const minimalState = (): GameState =>
  ({
    matchId: "match-1",
    seq: 1,
    actionSeq: 0,
    status: { type: "completed", winner: "p1" },
    players: {},
    cardManifest: { cards: {} },
    eventJournal: [],
    timers: { players: {} },
  }) as unknown as GameState;

describe("reconstructReplayArtifactStates", () => {
  test("returns the initial state as the first frame for an artifact with no actions", () => {
    const initialState = minimalState();
    const result = reconstructReplayArtifactStates({
      initialState,
      deterministicEntries: [],
      expectedFinalStateHash: undefined,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]?.label).toBe("Initial state");
  });

  test("fails closed for persisted entries without a replayable request", () => {
    const initialState = minimalState();
    const result = reconstructReplayArtifactStates({
      initialState,
      deterministicEntries: [{ envelope: { request: { type: "unknown" } } }],
      expectedFinalStateHash: undefined,
    });

    expect(result).toEqual({
      status: "failed",
      reason: "Replay entry has unsupported deterministic format.",
      entryIndex: 0,
    });
  });

  test("returns an initial frame window without decoding later entries", () => {
    const initialState = minimalState();
    const result = reconstructReplayArtifactStates({
      initialState,
      deterministicEntries: [{ envelope: { request: { type: "unknown" } } }],
      frameWindow: { start: 0, limit: 1 },
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.frameCount).toBe(2);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]?.label).toBe("Initial state");
  });

  test("rejects envelope-shaped entries as deterministic replay authority", () => {
    const initialState = minimalState();
    const result = reconstructReplayArtifactStates({
      initialState,
      deterministicEntries: [
        {
          envelope: {
            request: {
              type: "submitAction",
              playerId: "player-1",
              actionIndex: 0,
            },
          },
        },
      ],
      expectedFinalStateHash: undefined,
    });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toBe(
        "Replay entry has unsupported deterministic format.",
      );
    }
  });

  test("reconstructs timer ownership omitted from compact initial state", () => {
    const initialState = makeMainPhaseLegalActionState();
    const turnPlayerId = initialState.turn.turnPlayerId;
    const firstOpponentId = Object.keys(initialState.players).find(
      (playerId) => playerId !== turnPlayerId,
    ) as PlayerId | undefined;
    if (firstOpponentId === undefined) {
      throw new Error("Expected a two-player fixture.");
    }
    const stateBefore = {
      ...initialState,
      timers: {
        ...initialState.timers,
        drainingPlayerId: turnPlayerId,
      },
    };
    const baseEntry: DeterministicMatchEntry = {
      formatVersion: "deterministic-entry-v1",
      matchId: initialState.matchId,
      entrySeq: 0,
      kind: "action",
      playerId: turnPlayerId,
      action: { type: "endMainPhase" },
      verification: {
        stateSeqBefore: initialState.seq,
        actionSeqBefore: initialState.actionSeq,
        stateHashBefore: hashReplayStateForScope(stateBefore, "gameplay-v1"),
        stateSeqAfter: initialState.seq,
        actionSeqAfter: initialState.actionSeq,
        stateHashAfter: "placeholder",
        hashScope: "gameplay-v1",
      },
    };
    const applied = applyDeterministicOperation(stateBefore, baseEntry);
    if (applied.status !== "applied") {
      throw new Error("Expected fixture action to apply.");
    }
    const stateAfter = {
      ...applied.result.state,
      timers: {
        ...applied.result.state.timers,
        drainingPlayerId: firstOpponentId,
      },
    };
    const entry: DeterministicMatchEntry = {
      ...baseEntry,
      verification: {
        ...baseEntry.verification,
        stateSeqAfter: stateAfter.seq,
        actionSeqAfter: stateAfter.actionSeq,
        stateHashAfter: hashReplayStateForScope(stateAfter, "gameplay-v1"),
      },
    };

    const result = reconstructReplayArtifactStates({
      initialState,
      deterministicEntries: [entry],
      expectedFinalStateHash: entry.verification.stateHashAfter,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.frames.at(-1)?.stateHash).toBe(
      entry.verification.stateHashAfter,
    );
    expect(result.frames.at(-1)?.state.timers.drainingPlayerId).toBe(
      firstOpponentId,
    );
  });

  test("uses verified after-entry checkpoint snapshots as frame authority", () => {
    const initialState = makeMainPhaseLegalActionState();
    const afterState = {
      ...initialState,
      seq: (Number(initialState.seq) + 99) as StateSeq,
      actionSeq: initialState.actionSeq + 1,
      timers: {
        ...initialState.timers,
        drainingPlayerId: initialState.turn.turnPlayerId,
      },
    };
    const afterHash = hashReplayStateForScope(afterState, "gameplay-v1");
    const entry: DeterministicMatchEntry = {
      formatVersion: "deterministic-entry-v1",
      matchId: initialState.matchId,
      entrySeq: 0,
      kind: "action",
      playerId: initialState.turn.turnPlayerId,
      action: { type: "endMainPhase" },
      verification: {
        stateSeqBefore: initialState.seq,
        actionSeqBefore: initialState.actionSeq,
        stateHashBefore: hashReplayStateForScope(initialState, "gameplay-v1"),
        stateSeqAfter: afterState.seq,
        actionSeqAfter: afterState.actionSeq,
        stateHashAfter: afterHash,
        hashScope: "gameplay-v1",
      },
    };

    const result = reconstructReplayArtifactStates({
      initialState,
      deterministicEntries: [entry],
      checkpoints: [
        {
          checkpointVersion: "deterministic-checkpoint-v1",
          matchId: initialState.matchId,
          checkpointId: replayEntryAfterCheckpointId(entry.entrySeq),
          reason: "replayFrame",
          stateSeq: afterState.seq,
          actionSeq: afterState.actionSeq,
          stateHash: afterHash,
          hashScope: "gameplay-v1",
          snapshot: afterState,
        },
      ],
      expectedFinalStateHash: afterHash,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.frames).toHaveLength(2);
    expect(result.frames.at(-1)?.state).toEqual(afterState);
    expect(result.frames.at(-1)?.stateHash).toBe(afterHash);
  });

  test("uses timer-owner tolerant before-hash verification before after-entry checkpoints", () => {
    const initialState = makeMainPhaseLegalActionState();
    const stateBefore = {
      ...initialState,
      timers: {
        ...initialState.timers,
        drainingPlayerId: initialState.turn.turnPlayerId,
      },
    };
    const afterState = {
      ...stateBefore,
      seq: (Number(stateBefore.seq) + 1) as StateSeq,
      actionSeq: stateBefore.actionSeq + 1,
    };
    const afterHash = hashReplayStateForScope(afterState, "gameplay-v1");
    const entry: DeterministicMatchEntry = {
      formatVersion: "deterministic-entry-v1",
      matchId: initialState.matchId,
      entrySeq: 0,
      kind: "action",
      playerId: initialState.turn.turnPlayerId,
      action: { type: "endMainPhase" },
      verification: {
        stateSeqBefore: initialState.seq,
        actionSeqBefore: initialState.actionSeq,
        stateHashBefore: hashReplayStateForScope(stateBefore, "gameplay-v1"),
        stateSeqAfter: afterState.seq,
        actionSeqAfter: afterState.actionSeq,
        stateHashAfter: afterHash,
        hashScope: "gameplay-v1",
      },
    };

    const result = reconstructReplayArtifactStates({
      initialState,
      deterministicEntries: [entry],
      checkpoints: [
        {
          checkpointVersion: "deterministic-checkpoint-v1",
          matchId: initialState.matchId,
          checkpointId: replayEntryAfterCheckpointId(entry.entrySeq),
          reason: "replayFrame",
          stateSeq: afterState.seq,
          actionSeq: afterState.actionSeq,
          stateHash: afterHash,
          hashScope: "gameplay-v1",
          snapshot: afterState,
        },
      ],
      expectedFinalStateHash: afterHash,
    });

    expect(result.status).toBe("ready");
  });
});
