import { describe, expect, test, vi } from "vitest";
import type { MatchId } from "@optcg/types";

import {
  advanceMatchTimersAndBroadcastSafely,
  createSerializedMatchTimerAdvanceScheduler,
} from "./dev-match-timer-broadcast.js";

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("match timer broadcast scheduling", () => {
  test("does not overlap async timer advances and coalesces elapsed ticks", async () => {
    let now = 0;
    const pendingAdvances: Array<{
      readonly elapsedMs: number;
      readonly resolve: () => void;
    }> = [];
    const scheduler = createSerializedMatchTimerAdvanceScheduler({
      now: () => now,
      advance: (elapsedMs) =>
        new Promise<void>((resolve) => {
          pendingAdvances.push({ elapsedMs, resolve });
        }),
    });

    now = 1_000;
    scheduler.tick();
    now = 1_300;
    scheduler.tick();
    now = 1_600;
    scheduler.tick();

    expect(pendingAdvances.map((advance) => advance.elapsedMs)).toEqual([
      1_000,
    ]);

    pendingAdvances[0]?.resolve();
    await flushMicrotasks();

    expect(pendingAdvances.map((advance) => advance.elapsedMs)).toEqual([
      1_000, 600,
    ]);
  });

  test("reports timer advance errors without stopping later ticks", async () => {
    let now = 0;
    const errors: unknown[] = [];
    const advances: number[] = [];
    const failure = new Error("timer failed");
    const advance = vi
      .fn<(elapsedMs: number) => Promise<void>>()
      .mockImplementationOnce((elapsedMs) => {
        advances.push(elapsedMs);
        return Promise.reject(failure);
      })
      .mockImplementation((elapsedMs) => {
        advances.push(elapsedMs);
        return Promise.resolve();
      });
    const scheduler = createSerializedMatchTimerAdvanceScheduler({
      now: () => now,
      advance,
      onError: (error) => {
        errors.push(error);
      },
    });

    now = 250;
    scheduler.tick();
    await flushMicrotasks();
    now = 500;
    scheduler.tick();
    await flushMicrotasks();

    expect(errors).toEqual([failure]);
    expect(advances).toEqual([250, 250]);
  });

  test("reports fire-and-forget timer advance errors", async () => {
    const failure = new Error("advance failed");
    const errors: unknown[] = [];

    advanceMatchTimersAndBroadcastSafely({
      registry: {
        advanceTimers: () => Promise.reject(failure),
      },
      connections: new Set(),
      elapsedMs: 10,
      broadcast: () => undefined,
      onError: (error) => {
        errors.push(error);
      },
      matchIds: ["match-1" as MatchId],
    });
    await flushMicrotasks();

    expect(errors).toEqual([failure]);
  });
});
