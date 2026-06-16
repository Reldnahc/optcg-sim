import { describe, expect, it } from "vitest";

import type {
  CardId,
  EffectTextSpanId,
  EngineEventId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import {
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
  consumeResolvedSpotlightSourceKeys,
  consumeSpotlightSourceSignatures,
  currentSpotlightPlaybackEntry,
  effectSpotlightDisplayForEntry,
  effectSpotlightModel,
  effectSpotlightModelForPlayback,
  queuedResolvedSpotlightSources,
  resumeSpotlightModelAfterPause,
  shouldDisplayLiveSpotlightSource,
  type EffectSpotlightState,
  type UseEffectSpotlightState as HookState,
} from "./use-effect-spotlight.js";

type ControlsOnly = Extract<HookState, { active?: undefined }>;

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
  ...(mode === "live" && key.startsWith("decision:") && key.includes("|")
    ? { pendingDecisionId: key.slice("decision:".length, key.indexOf("|")) }
    : {}),
});

const combatSource = {
  kind: "combat" as const,
  id: "combat:event:attack",
  key: "event:attack",
  semanticKey:
    "combat|attackDeclared|p1|attacker-1|OP00-003|p2|defender-1|OP00-004|7000|5000",
  mode: "resolved" as const,
  status: "resolved" as const,
  combat: {
    eventKind: "attackDeclared" as const,
    attacker: {
      playerId: "p1" as PlayerId,
      instanceId: "attacker-1" as InstanceId,
      cardId: "OP00-003" as CardId,
    },
    defender: {
      playerId: "p2" as PlayerId,
      instanceId: "defender-1" as InstanceId,
      cardId: "OP00-004" as CardId,
    },
    attackerPower: 7000,
    defenderPower: 5000,
  },
  resolvedEventId: "event:attack" as EngineEventId,
};

describe("effect spotlight model", () => {
  it("pins while a pending decision has active effect text", () => {
    const entry = source("decision-1", "span:body:ko", "live");
    const model = effectSpotlightModel({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry,
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

  it("keeps combat sources in the same rewindable playback queue", () => {
    const state = appendSpotlightPlaybackSources({
      consumedKeys: new Set(),
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [combatSource],
      sourceKind: "serverTimeline",
    });

    expect(currentSpotlightPlaybackEntry(state)).toBe(combatSource);
    const caughtUp = advanceSpotlightPlayback({
      command: "catchUp",
      state,
    });
    expect(caughtUp.cursorIndex).toBeUndefined();
    const rewound = advanceSpotlightPlayback({
      command: "rewind",
      state: caughtUp,
    });
    expect(currentSpotlightPlaybackEntry(rewound)).toBe(combatSource);
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

  it("queues unresolved search follow-up spans after the search selection was shown live", () => {
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
      "event:resolved-search:span:search:remaining",
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

  it("preserves current spotlight timing progress when playback resumes", () => {
    const entry = source("event:first", "span:first");
    const model: EffectSpotlightState = {
      entry,
      active: entry.active,
      activeKey: "event:first",
      activeMode: "resolved",
      sourceInstanceId: "source-1",
      activeSpanIds: ["span:first"],
      shownAtMs: 1_000,
      visibleUntilMs: 3_000,
      pinned: false,
    };

    const resumed = resumeSpotlightModelAfterPause({
      model,
      pausedAtMs: 1_500,
      resumedAtMs: 5_000,
    });

    expect(resumed?.shownAtMs).toBe(4_500);
    expect(resumed?.visibleUntilMs).toBe(6_500);
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

  it("fast-forward clears resolved playback without deleting history", () => {
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

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
    ]);
    expect(next.cursorIndex).toBeUndefined();
    expect(next.paused).toBe(false);
    expect(next.fastForwarded).toBe(true);
  });

  it("fast-forwards to the latest pending decision entry", () => {
    const next = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [
          source("event:first", "span:first"),
          source(
            "decision:decision-1|source-1||span:pending",
            "span:pending",
            "live",
          ),
        ],
        cursorIndex: 0,
        paused: true,
      },
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "decision:decision-1|source-1||span:pending",
    ]);
    expect(next.cursorIndex).toBe(1);
    expect(next.paused).toBe(false);
  });

  it("keeps repeated server timeline entries with the same semantic key as separate playback entries", () => {
    const first = source("event:first", "span:body");
    const second = source("event:second", "span:body");

    const next = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      previous: {
        entries: [first],
        cursorIndex: 0,
        paused: false,
      },
      sourceKind: "serverTimeline",
      sources: [first, second],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
    ]);
    expect(next.cursorIndex).toBe(0);
  });

  it("fast forwards to the latest pending spotlight entry", () => {
    const playback = {
      entries: [
        source("decision:old|source-1||span:old", "span:old", "live"),
        source("event:resolved", "span:resolved"),
        source("decision:latest|source-1||span:latest", "span:latest", "live"),
      ],
      cursorIndex: 0,
      paused: true,
    };

    const next = advanceSpotlightPlayback({
      command: "catchUp",
      state: playback,
    });

    expect(next.cursorIndex).toBe(2);
    expect(next.paused).toBe(false);
    expect(next.fastForwarded).toBe(true);
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

  it("rewinds from fast-forwarded empty playback to the latest history entry", () => {
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

    expect(rewound.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
    ]);
    expect(rewound.cursorIndex).toBe(1);
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
      entry: source("event:first", "span:first"),
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

  it("hides display immediately when there is no playback cursor entry", () => {
    const entry = source("event:first", "span:first");
    const previous: EffectSpotlightState = {
      entry,
      active: entry.active,
      activeKey: "event:first",
      activeMode: "resolved",
      sourceInstanceId: "source-1",
      activeSpanIds: ["span:first"],
      shownAtMs: 1_000,
      visibleUntilMs: 3_000,
      pinned: false,
    };

    const display = effectSpotlightDisplayForEntry({
      nowMs: 1_100,
      previous,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: undefined,
      pendingDecisionId: undefined,
    });

    expect(display).toBeUndefined();
    const controlsOnlyEntry: ControlsOnly["entry"] = undefined;
    expect(controlsOnlyEntry).toBeUndefined();
  });

  it("pins a live cursor entry while a pending decision is active", () => {
    const display = effectSpotlightDisplayForEntry({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: source(
        "decision:decision-1|source-1||span:pending",
        "span:pending",
        "live",
      ),
      pendingDecisionId: "decision-1",
    });

    expect(display?.activeKey).toBe(
      "decision:decision-1|source-1||span:pending",
    );
    expect(display?.activeMode).toBe("live");
    expect(display?.pinned).toBe(true);
  });

  it("does not pin a stale live search selection after the pending decision advances", () => {
    const display = effectSpotlightDisplayForEntry({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: source(
        "decision:decision:selectCards:search|source-1||span:search:selection",
        "span:search:selection",
        "live",
      ),
      pendingDecisionId: "decision:orderCards:search",
    });

    expect(display?.activeKey).toBe(
      "decision:decision:selectCards:search|source-1||span:search:selection",
    );
    expect(display?.activeMode).toBe("live");
    expect(display?.pinned).toBe(false);
    expect(display?.visibleUntilMs).toBe(3_000);
  });

  it("advances from stale live search selection to the live remainder after dwell", () => {
    const liveSelection = source(
      "decision:decision:selectCards:search|source-1||span:search:selection",
      "span:search:selection",
      "live",
    );
    const suppressedResolvedSignatures = new Set<string>();
    consumeSpotlightSourceSignatures(suppressedResolvedSignatures, [
      liveSelection,
    ]);
    const playback = appendSpotlightPlaybackSources({
      consumedKeys: new Set<string>(),
      suppressedResolvedSignatures,
      previous: {
        entries: [liveSelection],
        cursorIndex: 0,
        paused: false,
      },
      sources: [
        source(
          "event:resolved-search:span:search:selection",
          "span:search:selection",
        ),
        source(
          "decision:decision:orderCards:search|source-1||span:search:remaining",
          "span:search:remaining",
          "live",
        ),
      ],
    });
    const staleDisplay = effectSpotlightModelForPlayback({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      playback,
      fallbackMode: "live",
      pendingDecisionId: "decision:orderCards:search",
    });
    const advancedPlayback = advanceSpotlightPlayback({
      command: "autoAdvance",
      state: playback,
    });
    const advancedDisplay = effectSpotlightModelForPlayback({
      nowMs: 3_000,
      previous: staleDisplay,
      minimumDwellMs: 2_000,
      graceMs: 800,
      playback: advancedPlayback,
      fallbackMode: "live",
      pendingDecisionId: "decision:orderCards:search",
    });

    expect(playback.entries.map((entry) => entry.key)).toEqual([
      "decision:decision:selectCards:search|source-1||span:search:selection",
      "decision:decision:orderCards:search|source-1||span:search:remaining",
    ]);
    expect(staleDisplay?.pinned).toBe(false);
    expect(advancedPlayback.cursorIndex).toBe(1);
    expect(advancedDisplay?.activeKey).toBe(
      "decision:decision:orderCards:search|source-1||span:search:remaining",
    );
    expect(advancedDisplay?.pinned).toBe(true);
  });

  it("uses resolved cursor entries with dwell timing without pinning", () => {
    const display = effectSpotlightDisplayForEntry({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: source("event:resolved", "span:resolved"),
      pendingDecisionId: "decision-1",
    });

    expect(display?.activeKey).toBe("event:resolved");
    expect(display?.activeMode).toBe("resolved");
    expect(display?.pinned).toBe(false);
    expect(display?.visibleUntilMs).toBe(3_000);
  });

  it("fast-forward displays the latest pending decision spotlight", () => {
    const playback = advanceSpotlightPlayback({
      command: "catchUp",
      state: {
        entries: [
          source("event:first", "span:first"),
          source(
            "decision:decision-1|source-1||span:pending",
            "span:pending",
            "live",
          ),
        ],
        cursorIndex: 0,
        paused: true,
      },
    });

    const display = effectSpotlightModelForPlayback({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      playback,
      fallbackMode: "live",
      pendingDecisionId: "decision-1",
    });

    expect(display?.activeKey).toBe(
      "decision:decision-1|source-1||span:pending",
    );
    expect(display?.activeMode).toBe("live");
    expect(display?.pinned).toBe(true);
  });

  it("keeps a newer pending decision from interrupting past review display", () => {
    const display = effectSpotlightModelForPlayback({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      playback: {
        entries: [
          source("event:first", "span:first"),
          source("decision:pending", "span:pending", "live"),
        ],
        cursorIndex: 0,
        paused: true,
      },
      fallbackMode: "live",
      pendingDecisionId: "decision-1",
    });

    expect(display?.activeKey).toBe("event:first");
    expect(display?.activeMode).toBe("resolved");
    expect(display?.pinned).toBe(false);
  });

  it("hides display after automatic playback advances past the latest resolved entry", () => {
    const previous = effectSpotlightModelForPlayback({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      playback: {
        entries: [source("event:first", "span:first")],
        cursorIndex: 0,
        paused: false,
      },
      fallbackMode: "live",
      pendingDecisionId: undefined,
    });
    const playback = advanceSpotlightPlayback({
      command: "autoAdvance",
      state: {
        entries: [source("event:first", "span:first")],
        cursorIndex: 0,
        paused: false,
      },
    });

    const display = effectSpotlightModelForPlayback({
      nowMs: 3_000,
      previous,
      minimumDwellMs: 2_000,
      graceMs: 800,
      playback,
      fallbackMode: "live",
      pendingDecisionId: undefined,
    });

    expect(display).toBeUndefined();
  });

  it("keeps minimum dwell after a fast decision resolves", () => {
    const previousEntry = source(
      "decision-1|source-1||span:body:ko",
      "span:body:ko",
      "live",
    );
    const previous = {
      entry: previousEntry,
      active: previousEntry.active,
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
      entry: undefined,
      pendingDecisionId: undefined,
    });

    expect(model?.visibleUntilMs).toBe(3_000);
  });

  it("stores resolved event keys without pinning them", () => {
    const entry = source("event:resolved:1", "span:body:ko");
    const model = effectSpotlightModel({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry,
      pendingDecisionId: undefined,
    });

    expect(model?.activeKey).toBe("event:resolved:1");
    expect(model?.activeMode).toBe("resolved");
    expect(model?.pinned).toBe(false);
  });

  it("switches from pinned cost text to resolved body text after payment", () => {
    const previousEntry = source(
      "decision:payCost|source-1||span:cost:optional",
      "span:cost:optional",
      "live",
    );
    const previous = {
      entry: previousEntry,
      active: previousEntry.active,
      activeKey: "decision:payCost|source-1||span:cost:optional",
      activeMode: "live" as const,
      sourceInstanceId: "source-1",
      activeSpanIds: ["span:cost:optional" as EffectTextSpanId],
      shownAtMs: 1_000,
      visibleUntilMs: 3_000,
      pinned: true,
    };
    const entry = source("event:resolved:body", "span:body");

    const model = effectSpotlightModel({
      nowMs: 1_200,
      previous,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry,
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

  it("queues unresolved search follow-up spans after the search selection was displayed live", () => {
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

    expect(queued.map((source) => source.key)).toEqual([
      "event:resolved-search:span:search:remaining",
    ]);
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
    const entry = source(
      "event:resolved:already-queued",
      "span:already-queued",
    );
    const resolvedModel = effectSpotlightModel({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry,
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
