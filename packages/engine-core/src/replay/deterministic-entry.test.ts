import { describe, expect, test } from "vitest";
import type { DeterministicMatchEntry, StateSeq } from "@optcg/types";

import { makeMainPhaseLegalActionState } from "../action-dispatcher-test-support.js";
import { p1, p2 } from "../action-test-fixtures.js";
import { applyDeterministicOperation } from "./deterministic-operation.js";
import {
  applyDeterministicEntry,
  hashReplayStateForScope,
} from "./deterministic-entry.js";

const actionEntry = (
  overrides: Partial<DeterministicMatchEntry["verification"]> = {},
): {
  readonly initialState: ReturnType<typeof makeMainPhaseLegalActionState>;
  readonly entry: DeterministicMatchEntry;
} => {
  const initialState = makeMainPhaseLegalActionState();
  const baseEntry: DeterministicMatchEntry = {
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
      stateSeqAfter: initialState.seq,
      actionSeqAfter: initialState.actionSeq,
      stateHashAfter: "placeholder",
      hashScope: "gameplay-v1",
    },
  };
  const applied = applyDeterministicOperation(initialState, baseEntry);
  if (applied.status !== "applied") {
    throw new Error("Expected action fixture to apply.");
  }
  return {
    initialState,
    entry: {
      ...baseEntry,
      verification: {
        ...baseEntry.verification,
        stateSeqAfter: applied.result.state.seq,
        actionSeqAfter: applied.result.state.actionSeq,
        stateHashAfter: hashReplayStateForScope(
          applied.result.state,
          "gameplay-v1",
        ),
        ...overrides,
      },
    },
  };
};

describe("applyDeterministicEntry", () => {
  test("fails before applying when state hash before does not match", () => {
    const { initialState, entry } = actionEntry({
      stateHashBefore: "wrong-before",
    });

    const result = applyDeterministicEntry(initialState, entry);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/before/i);
    }
  });

  test("fails after applying when state hash after does not match", () => {
    const { initialState, entry } = actionEntry({
      stateHashAfter: "wrong-after",
    });

    const result = applyDeterministicEntry(initialState, entry);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/after/i);
    }
  });

  test("applies when before and after verification match", () => {
    const { initialState, entry } = actionEntry();

    const result = applyDeterministicEntry(initialState, entry);

    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.state.seq).toBe(entry.verification.stateSeqAfter);
      expect(result.stateHash).toBe(entry.verification.stateHashAfter);
    }
  });
});

describe("hashReplayStateForScope", () => {
  test("gameplay hash ignores volatile timer drain values", () => {
    const first = makeMainPhaseLegalActionState();
    const second = structuredClone(first);
    first.timers = {
      drainingPlayerId: p1,
      players: {
        [p1]: { playerId: p1, remainingMs: 10_000, isRunning: true },
        [p2]: { playerId: p2, remainingMs: 9_000, isRunning: false },
      },
      disconnects: {
        [p2]: {
          playerId: p2,
          remainingMs: 500,
          isRunning: true,
          currentDisconnectElapsedMs: 120,
          disconnectStartedRemainingMs: 620,
        },
      },
    };
    second.timers = {
      drainingPlayerId: p1,
      players: {
        [p1]: { playerId: p1, remainingMs: 8_000, isRunning: false },
        [p2]: { playerId: p2, remainingMs: 7_000, isRunning: true },
      },
      disconnects: {
        [p2]: {
          playerId: p2,
          remainingMs: 300,
          isRunning: false,
          currentDisconnectElapsedMs: 320,
          disconnectStartedRemainingMs: 620,
        },
      },
    };

    expect(hashReplayStateForScope(first, "gameplay-v1")).toBe(
      hashReplayStateForScope(second, "gameplay-v1"),
    );
    expect(hashReplayStateForScope(first, "operational-v1")).not.toBe(
      hashReplayStateForScope(second, "operational-v1"),
    );
  });
});
