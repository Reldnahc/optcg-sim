import { describe, expect, it } from "vitest";

import type {
  CardRef,
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
import type { EffectTextSpotlightActiveSourceInput } from "./use-effect-spotlight-playback.js";

const source = (
  key: string,
  spanId: EffectTextSpanId,
  mode: "live" | "resolved" = "resolved",
): EffectTextSpotlightActiveSourceInput => ({
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

const ref = (
  instanceId: string,
  cardId: string,
  playerId: string = "p1",
): CardRef => ({
  instanceId: instanceId as InstanceId,
  cardId: cardId as CardId,
  playerId: playerId as PlayerId,
});

const withSelectedTarget = (
  entry: EffectTextSpotlightActiveSourceInput,
): EffectTextSpotlightActiveSourceInput => {
  const spanId = entry.active.activeSpanIds[0];
  if (spanId === undefined) {
    return entry;
  }
  return {
    ...entry,
    active: {
      ...entry.active,
      targetLinks: [
        {
          spanId,
          relation: "selectedTarget",
          cards: [ref("target-1", "OP00-002", "p2")],
        },
      ],
    },
  };
};

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

  it("refreshes a server timeline entry when target links arrive for an existing key", () => {
    const plainResolved = source("event:resolved", "span:body");
    const targetLinkedResolved = {
      ...plainResolved,
      active: {
        ...plainResolved.active,
        targetLinks: [
          {
            spanId: "span:body" as EffectTextSpanId,
            relation: "selectedTarget" as const,
            cards: [ref("target-1", "OP00-002", "p2")],
          },
        ],
      },
    };

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      previous: {
        entries: [plainResolved],
        cursorIndex: 0,
        paused: false,
        fastForwarded: false,
      },
      sources: [targetLinkedResolved],
      sourceKind: "serverTimeline",
    });

    expect(next.entries).toEqual([targetLinkedResolved]);
    expect(next.cursorIndex).toBe(0);
  });

  it("replays a consumed server timeline entry when target links arrive late", () => {
    const plainResolved = source("event:resolved", "span:body");
    const targetLinkedResolved = withSelectedTarget(plainResolved);

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set(["event:resolved"]),
      previous: {
        entries: [plainResolved],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [targetLinkedResolved],
      sourceKind: "serverTimeline",
    });

    expect(next.entries).toEqual([targetLinkedResolved]);
    expect(next.cursorIndex).toBe(0);
  });

  it("does not move the cursor for unchanged server timeline refreshes after catch-up", () => {
    const plainResolved = source("event:resolved", "span:body");

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set(["event:resolved"]),
      previous: {
        entries: [plainResolved],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [plainResolved],
      sourceKind: "serverTimeline",
    });

    expect(next.entries).toEqual([plainResolved]);
    expect(next.cursorIndex).toBeUndefined();
  });

  it("does not replay late target links after explicit fast-forward", () => {
    const plainResolved = source("event:resolved", "span:body");
    const targetLinkedResolved = withSelectedTarget(plainResolved);

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set(["event:resolved"]),
      previous: {
        entries: [plainResolved],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: true,
      },
      sources: [targetLinkedResolved],
      sourceKind: "serverTimeline",
    });

    expect(next.entries).toEqual([targetLinkedResolved]);
    expect(next.cursorIndex).toBeUndefined();
  });

  it("does not let an initial pending decision skip earlier resolved timeline entries", () => {
    const draw = source("event:draw", "span:sequence:0:body");
    const trash = {
      ...source(
        "decision:trash|source-1||span:sequence:1:body",
        "span:sequence:1:body",
        "live",
      ),
      pendingDecisionId: "decision:trash" as DecisionId,
    };

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      initialCursorKey: trash.key,
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [draw, trash],
      sourceKind: "serverTimeline",
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:draw",
      "decision:trash|source-1||span:sequence:1:body",
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
