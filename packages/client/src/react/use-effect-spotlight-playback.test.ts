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

const pendingSource = (
  decisionId: string,
  spanId: EffectTextSpanId,
): EffectTextSpotlightActiveSourceInput => ({
  ...source(`decision:${decisionId}|source-1||${spanId}`, spanId, "live"),
  pendingDecisionId: decisionId,
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

  it("replaces a completed-frame projection with its final resolved timeline entry", () => {
    const completedSelection = source(
      "completed-frame:queue:effect:decision:span:search:selection",
      "span:search:selection",
      "resolved",
    );
    const resolvedSelection = source(
      "event:resolved:span:search:selection",
      "span:search:selection",
      "resolved",
    );

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      previous: {
        entries: [completedSelection],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [resolvedSelection],
      sourceKind: "serverTimeline",
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:resolved:span:search:selection",
    ]);
    expect(next.cursorIndex).toBeUndefined();
  });

  it("replaces a stale live pending entry when another pending decision uses the same span", () => {
    const payCost = pendingSource("decision:payCost:1", "span:cost:optional");
    const selectReturnTarget = pendingSource(
      "decision:selectTargets:2",
      "span:cost:optional",
    );
    const previous = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [payCost],
      sourceKind: "serverTimeline",
    });

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      previous,
      sources: [selectReturnTarget],
      sourceKind: "serverTimeline",
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      selectReturnTarget.key,
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

  it("reconciles local playback when rollback removes server timeline entries", () => {
    const first = source("event:first", "span:first");
    const rolledBack = source("event:rolled-back", "span:rolled-back");
    const consumedKeys = new Set(["event:rolled-back"]);

    const reconciled = appendSpotlightPlaybackSources({
      consumedKeys,
      previous: {
        entries: [first, rolledBack],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [first],
      sourceKind: "serverTimeline",
    });

    expect(reconciled.entries.map((entry) => entry.key)).toEqual([
      "event:first",
    ]);
    expect(consumedKeys.has("event:rolled-back")).toBe(false);

    const replayed = appendSpotlightPlaybackSources({
      consumedKeys,
      previous: reconciled,
      sources: [first, rolledBack],
      sourceKind: "serverTimeline",
    });

    expect(replayed.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:rolled-back",
    ]);
    expect(replayed.cursorIndex).toBe(1);
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

  it("appends a live pending entry instead of replacing older resolved history with the same semantic key", () => {
    const oldResolved = source("event:old-resolved", "span:body");
    const liveRepeat = {
      ...source("decision:repeat|source-1||span:body", "span:body", "live"),
      pendingDecisionId: "decision:repeat" as DecisionId,
    };

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set(["event:old-resolved"]),
      previous: {
        entries: [oldResolved],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [oldResolved, liveRepeat],
      sourceKind: "serverTimeline",
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:old-resolved",
      "decision:repeat|source-1||span:body",
    ]);
    expect(next.cursorIndex).toBe(1);
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

  it("fast-forward clears stale pending decision history", () => {
    const next = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [
          pendingSource("decision-old", "span:old"),
          source("event:resolved", "span:resolved"),
        ],
        cursorIndex: 0,
        paused: true,
        fastForwarded: false,
      },
      pendingDecisionId: "decision-current",
    });

    expect(next.cursorIndex).toBeUndefined();
    expect(next.paused).toBe(false);
    expect(next.fastForwarded).toBe(true);
  });

  it("fast-forward displays the current pending decision among older pending history", () => {
    const next = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [
          pendingSource("decision-old", "span:old"),
          source("event:resolved", "span:resolved"),
          pendingSource("decision-latest", "span:latest"),
        ],
        cursorIndex: 0,
        paused: true,
        fastForwarded: false,
      },
      pendingDecisionId: "decision-latest",
    });

    expect(next.cursorIndex).toBe(2);
    expect(next.paused).toBe(false);
    expect(next.fastForwarded).toBe(true);
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
      ...pendingSource("decision-1", "span:pending"),
      id: "pending:decision-1:p1|source-1|OP00-001|effect|span:pending",
      semanticKey: "p1|source-1|OP00-001|effect|span:pending",
      status: "pending" as const,
    };
    const fastForwarded = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [source("event:first", "span:first"), pending],
        cursorIndex: 0,
        paused: true,
        fastForwarded: false,
      },
      pendingDecisionId: "decision-1",
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
