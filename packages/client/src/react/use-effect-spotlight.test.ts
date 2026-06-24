import { describe, expect, it } from "vitest";

import type {
  CardId,
  EffectTextSpotlightHistoryEntry,
  EffectTextSpanId,
  EngineEventId,
  InstanceId,
  PlayerId,
  PublicPendingDecisionId,
} from "@optcg/types";

import {
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
  currentSpotlightPlaybackEntry,
  effectSpotlightDisplayForEntry,
  effectSpotlightModel,
  effectSpotlightModelForPlayback,
  effectSpotlightStateForModel,
  type EffectSpotlightState,
  type EffectSpotlightControls,
  type UseEffectSpotlightState as HookState,
} from "./use-effect-spotlight.js";

type ControlsOnly = Extract<HookState, { active?: undefined }>;

const publicPendingId = (value: string): PublicPendingDecisionId =>
  value as PublicPendingDecisionId;

const controls: EffectSpotlightControls = {
  paused: false,
  canRewind: true,
  canStepForward: false,
  rewind: () => undefined,
  togglePaused: () => undefined,
  stepForward: () => undefined,
  catchUp: () => undefined,
};

const source = (
  key: string,
  spanId: EffectTextSpanId,
  mode: "live" | "resolved" = "resolved",
  pendingDecisionId?: PublicPendingDecisionId,
): EffectTextSpotlightHistoryEntry => ({
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
  ...(pendingDecisionId === undefined ? {} : { pendingDecisionId }),
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
      pendingDecisionId: publicPendingId("spotlight:pending:decision-1"),
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
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [combatSource],
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
    const first = source("event:first", "span:first");
    const second = source("event:second", "span:first");
    const next = appendSpotlightPlaybackSources({
      previous: {
        entries: [first],
        cursorIndex: 0,
        paused: false,
      },
      sources: [first, second],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
    ]);
  });

  it("keeps the cursor on a reviewed past entry when new sources arrive", () => {
    const first = source("event:first", "span:first");
    const second = source("event:second", "span:second");
    const third = source("event:third", "span:third");
    const next = appendSpotlightPlaybackSources({
      previous: {
        entries: [first, second],
        cursorIndex: 0,
        paused: true,
      },
      sources: [first, second, third],
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
      pendingDecisionId: publicPendingId("spotlight:pending:decision-1"),
      state: {
        entries: [
          source("event:first", "span:first"),
          source(
            "decision:decision-1|source-1||span:pending",
            "span:pending",
            "live",
            publicPendingId("spotlight:pending:decision-1"),
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
      previous: {
        entries: [first],
        cursorIndex: 0,
        paused: false,
      },
      sources: [first, second],
    });

    expect(next.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:second",
    ]);
    expect(next.cursorIndex).toBe(0);
  });

  it("does not interrupt past review when a live pending decision is appended", () => {
    const first = source("event:first", "span:first");
    const second = source("event:second", "span:second");
    const pending = source("decision:pending", "span:pending", "live");
    const initial = appendSpotlightPlaybackSources({
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
      },
      sources: [first, second],
    });

    const next = appendSpotlightPlaybackSources({
      previous: { ...initial, cursorIndex: 0, paused: true },
      sources: [first, second, pending],
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
        publicPendingId("spotlight:pending:decision-1"),
      ),
      pendingDecisionId: publicPendingId("spotlight:pending:decision-1"),
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
        publicPendingId("spotlight:pending:selectCards:search"),
      ),
      pendingDecisionId: publicPendingId("spotlight:pending:orderCards:search"),
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
      publicPendingId("spotlight:pending:selectCards:search"),
    );
    const resolvedSelection = source(
      "event:resolved-search:span:search:selection",
      "span:search:selection",
    );
    const liveRemainder = source(
      "decision:decision:orderCards:search|source-1||span:search:remaining",
      "span:search:remaining",
      "live",
      publicPendingId("spotlight:pending:orderCards:search"),
    );
    const playback = appendSpotlightPlaybackSources({
      previous: {
        entries: [liveSelection],
        cursorIndex: 0,
        paused: false,
      },
      sources: [resolvedSelection, liveRemainder],
    });
    const staleDisplay = effectSpotlightModelForPlayback({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      playback,
      fallbackMode: "live",
      pendingDecisionId: publicPendingId("spotlight:pending:orderCards:search"),
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
      pendingDecisionId: publicPendingId("spotlight:pending:orderCards:search"),
    });

    expect(playback.entries.map((entry) => entry.key)).toEqual([
      "event:resolved-search:span:search:selection",
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
      pendingDecisionId: publicPendingId("spotlight:pending:decision-1"),
    });

    expect(display?.activeKey).toBe("event:resolved");
    expect(display?.activeMode).toBe("resolved");
    expect(display?.pinned).toBe(false);
    expect(display?.visibleUntilMs).toBe(3_000);
  });

  it("fast-forward displays the latest pending decision spotlight", () => {
    const playback = advanceSpotlightPlayback({
      command: "catchUp",
      pendingDecisionId: publicPendingId("spotlight:pending:decision-1"),
      state: {
        entries: [
          source("event:first", "span:first"),
          source(
            "decision:decision-1|source-1||span:pending",
            "span:pending",
            "live",
            publicPendingId("spotlight:pending:decision-1"),
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
      pendingDecisionId: publicPendingId("spotlight:pending:decision-1"),
    });

    expect(display?.activeKey).toBe(
      "decision:decision-1|source-1||span:pending",
    );
    expect(display?.activeMode).toBe("live");
    expect(display?.pinned).toBe(true);
  });

  it("restores reconnect history at present key and catches up by public pending id", () => {
    const first = source("event:first", "span:first");
    const present = source("event:present", "span:present");
    const pending = source(
      "spotlight:pending:public-decision:0",
      "span:pending",
      "live",
      publicPendingId("spotlight:pending:public-decision"),
    );
    const restored = appendSpotlightPlaybackSources({
      initialCursorKey: present.key,
      previous: {
        entries: [],
        cursorIndex: undefined,
        paused: false,
        fastForwarded: false,
      },
      sources: [first, present],
    });
    const rewound = advanceSpotlightPlayback({
      command: "rewind",
      state: restored,
    });
    const hidden = advanceSpotlightPlayback({
      command: "catchUp",
      state: rewound,
    });
    const controlsOnly = effectSpotlightStateForModel({
      controls,
      controlsVisible: hidden.entries.length > 0,
      model: undefined,
    });
    const withPending = appendSpotlightPlaybackSources({
      previous: hidden,
      sources: [first, present, pending],
    });
    const caughtUp = advanceSpotlightPlayback({
      command: "catchUp",
      pendingDecisionId: publicPendingId("spotlight:pending:public-decision"),
      state: withPending,
    });

    expect(restored.cursorIndex).toBe(1);
    expect(rewound.cursorIndex).toBe(0);
    expect(hidden.cursorIndex).toBeUndefined();
    expect(controlsOnly).toEqual({ controls });
    expect(withPending.entries.map((entry) => entry.key)).toEqual([
      "event:first",
      "event:present",
      "spotlight:pending:public-decision:0",
    ]);
    expect(caughtUp.cursorIndex).toBe(2);
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
      pendingDecisionId: publicPendingId("spotlight:pending:decision-1"),
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
});
