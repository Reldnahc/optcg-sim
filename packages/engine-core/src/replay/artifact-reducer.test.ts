import { describe, expect, test } from "vitest";
import type { GameState } from "@optcg/types";

import { reconstructReplayArtifactStates } from "./artifact-reducer.js";

describe("reconstructReplayArtifactStates", () => {
  test("returns the initial state as the first frame for an artifact with no actions", () => {
    const initialState = {
      matchId: "match-1",
      seq: 1,
      actionSeq: 0,
      status: { type: "completed", winner: "p1" },
      players: {},
      eventJournal: [],
    } as unknown as GameState;
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
    const initialState = {
      matchId: "match-1",
      seq: 1,
      actionSeq: 0,
      status: { type: "main" },
      players: {},
      eventJournal: [],
    } as unknown as GameState;
    const result = reconstructReplayArtifactStates({
      initialState,
      deterministicEntries: [{ envelope: { request: { type: "unknown" } } }],
      expectedFinalStateHash: undefined,
    });

    expect(result).toEqual({
      status: "failed",
      reason: "Unsupported replay action unknown.",
      actionIndex: 0,
    });
  });
});
