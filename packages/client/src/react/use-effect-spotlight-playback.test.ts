import { describe, expect, it } from "vitest";

import type {
  CardRef,
  CardId,
  EffectTextSpanId,
  InstanceId,
  PlayerId,
  PublicPendingDecisionId,
} from "@optcg/types";

import {
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
} from "./use-effect-spotlight.js";
import type { EffectTextSpotlightActiveSourceInput } from "./use-effect-spotlight-playback.js";

const publicPendingId = (value: string): PublicPendingDecisionId =>
  value as PublicPendingDecisionId;

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
  pendingDecisionId: publicPendingId(`spotlight:pending:${decisionId}`),
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
          pendingDecisionId: publicPendingId("decision:select"),
        },
      ],
      cursorIndex: 0,
      paused: false,
      fastForwarded: false,
    };

    const next = appendSpotlightPlaybackSources({
      previous,
      sources: [resolvedSelection],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:resolved:span:search:selection",
    ]);
    expect(next.cursorIndex).toBe(0);
  });

  it("shows a newly appended authored entry after stale local history is removed", () => {
    const staleSelection = source(
      "event:rolled-back:span:search:selection",
      "span:search:selection",
      "resolved",
    );
    const resolvedSelection = source(
      "event:resolved:span:search:selection",
      "span:search:selection",
      "resolved",
    );

    const next = appendSpotlightPlaybackSources({
      previous: {
        entries: [staleSelection],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [resolvedSelection],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:resolved:span:search:selection",
    ]);
    expect(next.cursorIndex).toBe(0);
  });

  it("replaces a stale live pending entry when another pending decision uses the same span", () => {
    const payCost = pendingSource("decision:payCost:1", "span:cost:optional");
    const selectReturnTarget = pendingSource(
      "decision:selectTargets:2",
      "span:cost:optional",
    );
    const previous = appendSpotlightPlaybackSources({
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [payCost],
    });

    const next = appendSpotlightPlaybackSources({
      previous,
      sources: [selectReturnTarget],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      selectReturnTarget.key,
    ]);
    expect(next.cursorIndex).toBe(0);
  });

  it("treats same-key target link changes as the same authored entry", () => {
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
      previous: {
        entries: [plainResolved],
        cursorIndex: 0,
        paused: false,
        fastForwarded: false,
      },
      sources: [targetLinkedResolved],
    });

    expect(next.entries).toEqual([plainResolved]);
    expect(next.cursorIndex).toBe(0);
  });

  it("does not replay a consumed same-key entry when target links differ", () => {
    const plainResolved = source("event:resolved", "span:body");
    const targetLinkedResolved = withSelectedTarget(plainResolved);

    const next = appendSpotlightPlaybackSources({
      previous: {
        entries: [plainResolved],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [targetLinkedResolved],
    });

    expect(next.entries).toEqual([plainResolved]);
    expect(next.cursorIndex).toBeUndefined();
  });

  it("does not move the cursor for unchanged server timeline refreshes after catch-up", () => {
    const plainResolved = source("event:resolved", "span:body");

    const next = appendSpotlightPlaybackSources({
      previous: {
        entries: [plainResolved],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [plainResolved],
    });

    expect(next.entries).toEqual([plainResolved]);
    expect(next.cursorIndex).toBeUndefined();
  });

  it("reconciles local playback when rollback removes server timeline entries", () => {
    const first = source("event:first", "span:first");
    const rolledBack = source("event:rolled-back", "span:rolled-back");

    const reconciled = appendSpotlightPlaybackSources({
      previous: {
        entries: [first, rolledBack],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [first],
    });

    expect(reconciled.entries.map((entry) => entry.key)).toEqual([
      "event:first",
    ]);

    const replayed = appendSpotlightPlaybackSources({
      previous: reconciled,
      sources: [first, rolledBack],
    });

    expect(replayed.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:rolled-back",
    ]);
    expect(replayed.cursorIndex).toBe(1);
  });

  it("does not replay a consumed spotlight when target links are present on the authored entry", () => {
    const plainResolved = source("event:resolved", "span:body");
    const targetLinkedResolved = withSelectedTarget(plainResolved);

    const next = appendSpotlightPlaybackSources({
      previous: {
        entries: [plainResolved],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: true,
      },
      sources: [targetLinkedResolved],
    });

    expect(next.entries).toEqual([plainResolved]);
    expect(next.cursorIndex).toBeUndefined();
  });

  it("receiving the same timeline snapshot twice does not append or replay", () => {
    const first = source("event:first", "span:first");
    const second = source("event:second", "span:second");
    const initial = appendSpotlightPlaybackSources({
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [first, second],
    });

    const repeated = appendSpotlightPlaybackSources({
      previous: { ...initial, cursorIndex: undefined },
      sources: [first, second],
    });

    expect(repeated.entries).toEqual([first, second]);
    expect(repeated.cursorIndex).toBeUndefined();
  });

  it("does not replay a consumed entry when a transient empty timeline restores it", () => {
    const played = source("event:played", "span:played");
    const initial = appendSpotlightPlaybackSources({
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [played],
    });
    const consumed = advanceSpotlightPlayback({
      command: "autoAdvance",
      state: initial,
    });
    const emptyRefresh = appendSpotlightPlaybackSources({
      previous: consumed,
      sources: [],
    });

    const restored = appendSpotlightPlaybackSources({
      previous: emptyRefresh,
      sources: [played],
    });

    expect(restored.entries.map((entry) => entry.key)).toEqual([
      "event:played",
    ]);
    expect(restored.cursorIndex).toBeUndefined();
  });

  it("does not replay an entry skipped by catch-up when an empty timeline restores it", () => {
    const played = source("event:played", "span:played");
    const caughtUp = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [played],
        cursorIndex: 0,
        paused: true,
        fastForwarded: false,
      },
    });
    const emptyRefresh = appendSpotlightPlaybackSources({
      previous: caughtUp,
      sources: [],
    });

    const restored = appendSpotlightPlaybackSources({
      previous: emptyRefresh,
      sources: [played],
    });

    expect(restored.entries.map((entry) => entry.key)).toEqual([
      "event:played",
    ]);
    expect(restored.cursorIndex).toBeUndefined();
  });

  it("does not suppress a restored entry with the same key but different authored identity", () => {
    const played = source("event:played", "span:played");
    const differentIdentity = {
      ...played,
      active: {
        ...played.active,
        source: {
          ...played.active.source,
          instanceId: "source-2" as InstanceId,
        },
      },
    };
    const consumed = advanceSpotlightPlayback({
      command: "autoAdvance",
      state: {
        entries: [played],
        cursorIndex: 0,
        paused: false,
        fastForwarded: false,
      },
    });
    const emptyRefresh = appendSpotlightPlaybackSources({
      previous: consumed,
      sources: [],
    });

    const restored = appendSpotlightPlaybackSources({
      previous: emptyRefresh,
      sources: [differentIdentity],
    });

    expect(restored.entries).toEqual([differentIdentity]);
    expect(restored.cursorIndex).toBe(0);
  });

  it("replaces a retained same-key entry when authored identity changes", () => {
    const played = source("event:played", "span:played");
    const differentIdentity = {
      ...played,
      active: {
        ...played.active,
        source: {
          ...played.active.source,
          instanceId: "source-2" as InstanceId,
        },
      },
    };
    const consumed = advanceSpotlightPlayback({
      command: "autoAdvance",
      state: {
        entries: [played],
        cursorIndex: 0,
        paused: false,
        fastForwarded: false,
      },
    });

    const replaced = appendSpotlightPlaybackSources({
      previous: consumed,
      sources: [differentIdentity],
    });

    expect(replaced.entries).toEqual([differentIdentity]);
    expect(replaced.cursorIndex).toBe(0);
  });

  it("appends a live pending entry instead of replacing older resolved history with the same semantic key", () => {
    const oldResolved = source("event:old-resolved", "span:body");
    const liveRepeat = {
      ...source("decision:repeat|source-1||span:body", "span:body", "live"),
      pendingDecisionId: publicPendingId("decision:repeat"),
    };

    const next = appendSpotlightPlaybackSources({
      previous: {
        entries: [oldResolved],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [oldResolved, liveRepeat],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:old-resolved",
      "decision:repeat|source-1||span:body",
    ]);
    expect(next.cursorIndex).toBe(1);
  });

  it("starts initial server history at the present pending entry", () => {
    const draw = source("event:draw", "span:sequence:0:body");
    const trash = {
      ...source(
        "decision:trash|source-1||span:sequence:1:body",
        "span:sequence:1:body",
        "live",
      ),
      pendingDecisionId: publicPendingId("decision:trash"),
    };

    const next = appendSpotlightPlaybackSources({
      initialCursorKey: trash.key,
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [draw, trash],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:draw",
      "decision:trash|source-1||span:sequence:1:body",
    ]);
    expect(next.cursorIndex).toBe(1);
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
      pendingDecisionId: publicPendingId("spotlight:pending:decision-current"),
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
      pendingDecisionId: publicPendingId("spotlight:pending:decision-latest"),
    });

    expect(next.cursorIndex).toBe(2);
    expect(next.paused).toBe(false);
    expect(next.fastForwarded).toBe(true);
  });

  it("fast-forward pins by public pending spotlight id, not raw decision id", () => {
    const pending = {
      ...source("spotlight:pending:public-anchor:0", "span:pending", "live"),
      pendingDecisionId: publicPendingId("spotlight:pending:public-anchor"),
    };
    const state = {
      entries: [pending],
      cursorIndex: undefined,
      paused: true,
      fastForwarded: false,
    };

    const rawDecisionCatchUp = advanceSpotlightPlayback({
      command: "catchUp",
      state,
      // @ts-expect-error raw decision ids must not be accepted as spotlight catch-up ids.
      pendingDecisionId: "decision:raw-engine-id",
    });
    const publicDecisionCatchUp = advanceSpotlightPlayback({
      command: "catchUp",
      state,
      pendingDecisionId: publicPendingId("spotlight:pending:public-anchor"),
    });

    expect(rawDecisionCatchUp.cursorIndex).toBeUndefined();
    expect(publicDecisionCatchUp.cursorIndex).toBe(0);
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
      pendingDecisionId: publicPendingId("spotlight:pending:decision-1"),
    };
    const fastForwarded = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [source("event:first", "span:first"), pending],
        cursorIndex: 0,
        paused: true,
        fastForwarded: false,
      },
      pendingDecisionId: publicPendingId("spotlight:pending:decision-1"),
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
