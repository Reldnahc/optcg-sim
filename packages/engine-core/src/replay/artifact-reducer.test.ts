import { describe, expect, test } from "vitest";
import type { GameState } from "@optcg/types";

import { reconstructReplayArtifactStates } from "./artifact-reducer.js";

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
});
