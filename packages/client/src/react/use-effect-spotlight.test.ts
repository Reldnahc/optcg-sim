import { describe, expect, it } from "vitest";

import type {
  CardId,
  EffectTextSpanId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import {
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
  consumeResolvedSpotlightSourceKeys,
  consumeSpotlightSourceSignatures,
  effectSpotlightModel,
  effectSpotlightModelForPlayback,
  queuedResolvedSpotlightSources,
  shouldDisplayLiveSpotlightSource,
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
  key,
  mode,
});

describe("effect spotlight model", () => {
  it("pins while a pending decision has active effect text", () => {
    const model = effectSpotlightModel({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      active: {
        source: {
          instanceId: "source-1" as InstanceId,
          cardId: "OP00-001" as CardId,
          playerId: "p1" as PlayerId,
        },
        activeSpanIds: ["span:body:ko"],
      },
      pendingDecisionId: "decision-1",
    });

    expect(model?.pinned).toBe(true);
    expect(model?.visibleUntilMs).toBeGreaterThan(1_000);
  });

  it("retains every unseen source in arrival order without consuming the active cursor", () => {
    const previous = {
      entries: [source("event:first", "span:first")],
      cursorIndex: 0,
      paused: false,
    };

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      previous,
      sources: [
        source("event:first", "span:first"),
        source("event:second", "span:second"),
        source("decision:third", "span:third", "live"),
      ],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
      "decision:third",
    ]);
    expect(next.cursorIndex).toBe(0);
    expect(next.paused).toBe(false);
  });

  it("starts server-projected history at the present source on initial load", () => {
    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      initialCursorKey: "event:second",
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
      },
      sources: [
        source("event:first", "span:first"),
        source("event:second", "span:second"),
      ],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
    ]);
    expect(next.cursorIndex).toBe(1);
    expect(next.paused).toBe(false);
  });

  it("appends repeated effects when a new event key reuses a card span signature", () => {
    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      previous: {
        entries: [source("event:first", "span:first")],
        cursorIndex: 0,
        paused: false,
      },
      sources: [source("event:second", "span:first")],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
    ]);
  });

  it("suppresses only the first resolved source already shown live", () => {
    const suppressedResolvedSignatures = new Set<string>();
    consumeSpotlightSourceSignatures(suppressedResolvedSignatures, [
      source("decision:first", "span:first", "live"),
    ]);

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      suppressedResolvedSignatures,
      previous: {
        entries: [source("decision:first", "span:first", "live")],
        cursorIndex: 0,
        paused: false,
      },
      sources: [
        source("event:resolved-duplicate", "span:first"),
        source("event:later-repeat", "span:first"),
      ],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "decision:first",
      "event:later-repeat",
    ]);
    expect([...suppressedResolvedSignatures]).toEqual([]);
  });

  it("suppresses resolved search spans after the search was already shown live", () => {
    const suppressedResolvedSignatures = new Set<string>();
    consumeSpotlightSourceSignatures(suppressedResolvedSignatures, [
      source("decision:search-selection", "span:search:selection", "live"),
    ]);

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      suppressedResolvedSignatures,
      previous: {
        entries: [
          source("decision:search-selection", "span:search:selection", "live"),
        ],
        cursorIndex: 0,
        paused: false,
      },
      sources: [
        source(
          "event:resolved-search:span:search:selection",
          "span:search:selection",
        ),
        source(
          "event:resolved-search:span:search:remaining",
          "span:search:remaining",
        ),
      ],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "decision:search-selection",
    ]);
    expect([...suppressedResolvedSignatures]).toEqual([]);
  });

  it("keeps the cursor on a reviewed past entry when new sources arrive", () => {
    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      previous: {
        entries: [
          source("event:first", "span:first"),
          source("event:second", "span:second"),
        ],
        cursorIndex: 0,
        paused: true,
      },
      sources: [source("event:third", "span:third")],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
      "event:third",
    ]);
    expect(next.cursorIndex).toBe(0);
    expect(next.paused).toBe(true);
  });

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

  it("does not auto-advance while paused and resumes after play", () => {
    const paused = advanceSpotlightPlayback({
      command: "autoAdvance",
      state: {
        entries: [
          source("event:first", "span:first"),
          source("event:second", "span:second"),
        ],
        cursorIndex: 0,
        paused: true,
      },
    });
    const resumed = advanceSpotlightPlayback({
      command: "play",
      state: paused,
    });
    const advanced = advanceSpotlightPlayback({
      command: "autoAdvance",
      state: resumed,
    });

    expect(paused.cursorIndex).toBe(0);
    expect(resumed.paused).toBe(false);
    expect(advanced.cursorIndex).toBe(1);
  });

  it("steps forward only when the cursor is behind the present entry", () => {
    const behind = advanceSpotlightPlayback({
      command: "stepForward",
      state: {
        entries: [
          source("event:first", "span:first"),
          source("event:second", "span:second"),
        ],
        cursorIndex: 0,
        paused: true,
      },
    });
    const atPresent = advanceSpotlightPlayback({
      command: "stepForward",
      state: behind,
    });

    expect(behind.cursorIndex).toBe(1);
    expect(atPresent.cursorIndex).toBe(1);
  });

  it("fast-forwards to the latest entry without deleting history", () => {
    const next = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [
          source("event:first", "span:first"),
          source("event:second", "span:second"),
        ],
        cursorIndex: 0,
        paused: true,
      },
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
    ]);
    expect(next.cursorIndex).toBe(1);
    expect(next.paused).toBe(false);
  });

  it("fast-forwards to the latest pending decision entry", () => {
    const next = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [
          source("event:first", "span:first"),
          source("decision:pending", "span:pending", "live"),
        ],
        cursorIndex: 0,
        paused: true,
      },
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "decision:pending",
    ]);
    expect(next.cursorIndex).toBe(1);
    expect(next.paused).toBe(false);
  });

  it("does not interrupt past review when a live pending decision is appended", () => {
    const initial = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
      },
      sources: [
        source("event:first", "span:first"),
        source("event:second", "span:second"),
      ],
    });

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      previous: { ...initial, cursorIndex: 0, paused: true },
      sources: [source("decision:pending", "span:pending", "live")],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
      "decision:pending",
    ]);
    expect(next.cursorIndex).toBe(0);
    expect(next.paused).toBe(true);
  });

  it("rewinds from fast-forwarded history to the previous entry", () => {
    const fastForwarded = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [
          source("event:first", "span:first"),
          source("event:second", "span:second"),
        ],
        cursorIndex: 0,
        paused: true,
      },
    });
    const rewound = advanceSpotlightPlayback({
      command: "rewind",
      state: fastForwarded,
    });

    expect(rewound.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
    ]);
    expect(rewound.cursorIndex).toBe(0);
    expect(rewound.paused).toBe(true);
  });

  it("hides the final resolved spotlight when automatic playback catches up", () => {
    const current = {
      entries: [source("event:first", "span:first")],
      cursorIndex: 0,
      paused: false,
    };

    const next = advanceSpotlightPlayback({
      command: "autoAdvance",
      state: current,
    });

    expect(next.entries.map((entry) => entry.key)).toEqual(["event:first"]);
    expect(next.cursorIndex).toBeUndefined();
    expect(next.paused).toBe(false);
  });

  it("derives displayed spotlight directly from the playback cursor", () => {
    const previousModel = effectSpotlightModel({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      active: source("event:first", "span:first").active,
      activeKey: "event:first",
      activeMode: "resolved",
      pendingDecisionId: undefined,
    });

    const display = effectSpotlightModelForPlayback({
      nowMs: 1_100,
      previous: previousModel,
      minimumDwellMs: 2_000,
      graceMs: 800,
      playback: {
        entries: [
          source("event:first", "span:first"),
          source("event:second", "span:second"),
        ],
        cursorIndex: 1,
        paused: false,
      },
      fallbackMode: "live",
      pendingDecisionId: undefined,
    });

    expect(display?.activeKey).toBe("event:second");
    expect(display?.activeSpanIds).toEqual(["span:second"]);
  });

  it("keeps minimum dwell after a fast decision resolves", () => {
    const previous = {
      active: {
        source: {
          instanceId: "source-1" as InstanceId,
          cardId: "OP00-001" as CardId,
          playerId: "p1" as PlayerId,
        },
        activeSpanIds: ["span:body:ko" as EffectTextSpanId],
      },
      activeKey: "decision-1|source-1||span:body:ko",
      activeMode: "live" as const,
      sourceInstanceId: "source-1",
      activeSpanIds: ["span:body:ko" as EffectTextSpanId],
      shownAtMs: 1_000,
      visibleUntilMs: 3_000,
      pinned: true,
    };
    const model = effectSpotlightModel({
      nowMs: 1_200,
      previous,
      minimumDwellMs: 2_000,
      graceMs: 800,
      active: undefined,
      pendingDecisionId: undefined,
    });

    expect(model?.visibleUntilMs).toBe(3_000);
  });

  it("stores resolved event keys without pinning them", () => {
    const model = effectSpotlightModel({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      active: {
        source: {
          instanceId: "source-1" as InstanceId,
          cardId: "OP00-001" as CardId,
          playerId: "p1" as PlayerId,
        },
        activeSpanIds: ["span:body:ko"],
      },
      activeKey: "event:resolved:1",
      activeMode: "resolved",
      pendingDecisionId: undefined,
    });

    expect(model?.activeKey).toBe("event:resolved:1");
    expect(model?.activeMode).toBe("resolved");
    expect(model?.pinned).toBe(false);
  });

  it("switches from pinned cost text to resolved body text after payment", () => {
    const previous = {
      active: {
        source: {
          instanceId: "source-1" as InstanceId,
          cardId: "OP00-001" as CardId,
          playerId: "p1" as PlayerId,
        },
        activeSpanIds: ["span:cost:optional" as EffectTextSpanId],
      },
      activeKey: "decision:payCost|source-1||span:cost:optional",
      activeMode: "live" as const,
      sourceInstanceId: "source-1",
      activeSpanIds: ["span:cost:optional" as EffectTextSpanId],
      shownAtMs: 1_000,
      visibleUntilMs: 3_000,
      pinned: true,
    };

    const model = effectSpotlightModel({
      nowMs: 1_200,
      previous,
      minimumDwellMs: 2_000,
      graceMs: 800,
      active: {
        source: {
          instanceId: "source-1" as InstanceId,
          cardId: "OP00-001" as CardId,
          playerId: "p1" as PlayerId,
        },
        activeSpanIds: ["span:body"],
      },
      activeKey: "event:resolved:body",
      activeMode: "resolved",
      pendingDecisionId: undefined,
    });

    expect(model?.activeSpanIds).toEqual(["span:body"]);
    expect(model?.activeKey).toBe("event:resolved:body");
    expect(model?.activeMode).toBe("resolved");
    expect(model?.pinned).toBe(false);
    expect(model?.visibleUntilMs).toBe(3_200);
  });

  it("queues unseen resolved spotlights without replaying current or consumed events", () => {
    const baseSource = {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-001" as CardId,
      playerId: "p1" as PlayerId,
    };
    const queued = queuedResolvedSpotlightSources({
      consumedKeys: new Set(["event:consumed"]),
      currentKey: "event:current",
      previousQueue: [
        {
          active: {
            source: baseSource,
            activeSpanIds: ["span:queued"],
          },
          key: "event:queued",
          mode: "resolved",
        },
      ],
      sources: [
        {
          active: {
            source: baseSource,
            activeSpanIds: ["span:current"],
          },
          key: "event:current",
          mode: "resolved",
        },
        {
          active: {
            source: baseSource,
            activeSpanIds: ["span:consumed"],
          },
          key: "event:consumed",
          mode: "resolved",
        },
        {
          active: {
            source: baseSource,
            activeSpanIds: ["span:next"],
          },
          key: "event:next",
          mode: "resolved",
        },
      ],
    });

    expect(queued.map((source) => source.key)).toEqual([
      "event:queued",
      "event:next",
    ]);
  });

  it("does not queue resolved search spans after the search was already displayed live", () => {
    const baseSource = {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-001" as CardId,
      playerId: "p1" as PlayerId,
    };
    const consumedSignatures = new Set<string>();
    consumeSpotlightSourceSignatures(consumedSignatures, [
      {
        active: {
          source: baseSource,
          activeSpanIds: ["span:search:selection"],
        },
        key: "decision:search-selection",
        mode: "live",
      },
    ]);

    const queued = queuedResolvedSpotlightSources({
      consumedKeys: new Set(),
      consumedSignatures,
      currentKey: undefined,
      previousQueue: [],
      sources: [
        {
          active: {
            source: baseSource,
            activeSpanIds: ["span:search:selection"],
          },
          key: "event:resolved-search:span:search:selection",
          mode: "resolved",
        },
        {
          active: {
            source: baseSource,
            activeSpanIds: ["span:search:remaining"],
          },
          key: "event:resolved-search:span:search:remaining",
          mode: "resolved",
        },
      ],
    });

    expect(queued.map((source) => source.key)).toEqual([]);
  });

  it("keeps resolved multi-span sources when only part of the source was displayed live", () => {
    const baseSource = {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-001" as CardId,
      playerId: "p1" as PlayerId,
    };
    const consumedSignatures = new Set<string>();
    consumeSpotlightSourceSignatures(consumedSignatures, [
      {
        active: {
          source: baseSource,
          activeSpanIds: ["span:cost"],
        },
        key: "decision:cost",
        mode: "live",
      },
    ]);

    const queued = queuedResolvedSpotlightSources({
      consumedKeys: new Set(),
      consumedSignatures,
      currentKey: undefined,
      previousQueue: [],
      sources: [
        {
          active: {
            source: baseSource,
            activeSpanIds: ["span:cost", "span:body"],
          },
          key: "event:resolved-body",
          mode: "resolved",
        },
      ],
    });

    expect(queued.map((source) => source.key)).toEqual(["event:resolved-body"]);
  });

  it("holds live pending-decision spotlight sources behind active resolved queue work", () => {
    const resolvedModel = effectSpotlightModel({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      active: {
        source: {
          instanceId: "source-1" as InstanceId,
          cardId: "OP00-001" as CardId,
          playerId: "p1" as PlayerId,
        },
        activeSpanIds: ["span:already-queued"],
      },
      activeKey: "event:resolved:already-queued",
      activeMode: "resolved",
      pendingDecisionId: undefined,
    });

    expect(
      shouldDisplayLiveSpotlightSource({
        liveSourceExists: true,
        model: resolvedModel,
        pendingResolvedSourceCount: 0,
        resolvedQueueLength: 0,
      }),
    ).toBe(false);
    expect(
      shouldDisplayLiveSpotlightSource({
        liveSourceExists: true,
        model: undefined,
        pendingResolvedSourceCount: 0,
        resolvedQueueLength: 1,
      }),
    ).toBe(false);
    expect(
      shouldDisplayLiveSpotlightSource({
        liveSourceExists: true,
        model: undefined,
        pendingResolvedSourceCount: 0,
        resolvedQueueLength: 0,
      }),
    ).toBe(true);
    expect(
      shouldDisplayLiveSpotlightSource({
        liveSourceExists: true,
        model: undefined,
        pendingResolvedSourceCount: 1,
        resolvedQueueLength: 0,
      }),
    ).toBe(false);
  });

  it("can seed initial resolved sources as consumed without blocking later sources", () => {
    const baseSource = {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-001" as CardId,
      playerId: "p1" as PlayerId,
    };
    const historical = {
      active: {
        source: baseSource,
        activeSpanIds: ["span:historical" as EffectTextSpanId],
      },
      key: "event:historical",
      mode: "resolved" as const,
    };
    const next = {
      active: {
        source: baseSource,
        activeSpanIds: ["span:next" as EffectTextSpanId],
      },
      key: "event:next",
      mode: "resolved" as const,
    };
    const consumedKeys = new Set<string>();

    consumeResolvedSpotlightSourceKeys(consumedKeys, [historical]);

    expect(
      queuedResolvedSpotlightSources({
        consumedKeys,
        currentKey: undefined,
        previousQueue: [],
        sources: [historical],
      }),
    ).toEqual([]);
    expect(
      queuedResolvedSpotlightSources({
        consumedKeys,
        currentKey: undefined,
        previousQueue: [],
        sources: [historical, next],
      }).map((source) => source.key),
    ).toEqual(["event:next"]);
  });
});
