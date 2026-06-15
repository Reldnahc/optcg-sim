import { describe, expect, it } from "vitest";

import type {
  CardId,
  DecisionId,
  EffectTextSpanId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import {
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
} from "./use-effect-spotlight.js";

const source = (
  key: string,
  spanId: EffectTextSpanId,
  mode: "live" | "resolved" = "resolved",
) => ({
  active: {
    source: {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-001" as CardId,
      playerId: "p1" as PlayerId,
    },
    activeSpanIds: [spanId],
  },
  id: key,
  key,
  semanticKey: `p1|source-1|OP00-001|effect|${spanId}`,
  mode,
  status: mode === "live" ? ("pending" as const) : ("resolved" as const),
});

describe("effect spotlight playback", () => {
  it("rewinds to the previous entry and pauses playback", () => {
    const next = advanceSpotlightPlayback({
      command: "rewind",
      state: {
        entries: [
          source("event:first", "span:first"),
          source("event:second", "span:second"),
        ],
        cursorIndex: 1,
        paused: false,
      },
    });

    expect(next.cursorIndex).toBe(0);
    expect(next.paused).toBe(true);
  });

  it("replaces a displayed live entry with its resolved timeline entry without queueing a duplicate", () => {
    const liveSelection = source(
      "decision:select|source-1||span:search:selection",
      "span:search:selection",
      "live",
    );
    const resolvedSelection = {
      ...source(
        "event:resolved:span:search:selection",
        "span:search:selection",
        "resolved",
      ),
      id: "resolved:event:resolved:span:search:selection",
      semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
      status: "resolved" as const,
    };
    const previous = {
      entries: [
        {
          ...liveSelection,
          id: "pending:decision:select:p1|source-1|OP00-001|effect|span:search:selection",
          semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
          status: "pending" as const,
          pendingDecisionId: "decision:select" as DecisionId,
        },
      ],
      cursorIndex: 0,
      paused: false,
      fastForwarded: false,
    };

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      previous,
      sources: [resolvedSelection],
      sourceKind: "serverTimeline",
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:resolved:span:search:selection",
    ]);
    expect(next.cursorIndex).toBe(0);
  });

  it("fast-forward clears to empty when there is no pending timeline entry", () => {
    const next = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [
          source("event:first", "span:first"),
          source("event:second", "span:second"),
        ],
        cursorIndex: 0,
        paused: true,
        fastForwarded: false,
      },
    });

    expect(next.cursorIndex).toBeUndefined();
    expect(next.paused).toBe(false);
    expect(next.fastForwarded).toBe(true);
  });

  it("fast-forward ignores live entries that are not pending decisions", () => {
    const next = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [
          source("event:first", "span:first"),
          source("active|source-1||span:active", "span:active", "live"),
        ],
        cursorIndex: 0,
        paused: true,
        fastForwarded: false,
      },
    });

    expect(next.cursorIndex).toBeUndefined();
  });

  it("rewind after fast-forward to empty lands on the latest historical entry", () => {
    const fastForwarded = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [
          source("event:first", "span:first"),
          source("event:second", "span:second"),
        ],
        cursorIndex: 0,
        paused: true,
        fastForwarded: false,
      },
    });

    const rewound = advanceSpotlightPlayback({
      command: "rewind",
      state: fastForwarded,
    });

    expect(rewound.cursorIndex).toBe(1);
    expect(rewound.paused).toBe(true);
  });

  it("rewind from a pinned pending present lands on the previous timeline entry", () => {
    const pending = {
      ...source(
        "decision:decision-1|source-1||span:pending",
        "span:pending",
        "live",
      ),
      id: "pending:decision-1:p1|source-1|OP00-001|effect|span:pending",
      semanticKey: "p1|source-1|OP00-001|effect|span:pending",
      status: "pending" as const,
      pendingDecisionId: "decision-1" as DecisionId,
    };
    const fastForwarded = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [source("event:first", "span:first"), pending],
        cursorIndex: 0,
        paused: true,
        fastForwarded: false,
      },
    });

    const rewound = advanceSpotlightPlayback({
      command: "rewind",
      state: fastForwarded,
    });

    expect(fastForwarded.cursorIndex).toBe(1);
    expect(rewound.cursorIndex).toBe(0);
    expect(rewound.paused).toBe(true);
  });
});
