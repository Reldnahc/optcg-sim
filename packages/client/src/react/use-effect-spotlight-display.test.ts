import { describe, expect, it } from "vitest";

import type {
  CardId,
  CardRef,
  EffectTextSpotlightHistoryEntry,
  EffectTextSpanId,
  EngineEventId,
  InstanceId,
  PlayerId,
  PublicPendingDecisionId,
} from "@optcg/types";

import {
  effectSpotlightTimerAnimationKey,
  effectSpotlightDisplayForEntry,
  type EffectSpotlightState,
} from "./use-effect-spotlight.js";

const source = (
  key: string,
  spanId: EffectTextSpanId,
  mode: "live" | "resolved" = "resolved",
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
});

const publicPendingId = (value: string): PublicPendingDecisionId =>
  value as PublicPendingDecisionId;

const target: CardRef = {
  playerId: "p2" as PlayerId,
  instanceId: "target-1" as InstanceId,
  cardId: "OP00-002" as CardId,
};

const requireDisplay = (
  display: EffectSpotlightState | undefined,
): EffectSpotlightState => {
  expect(display).toBeDefined();
  if (display === undefined) {
    throw new Error("Expected spotlight display.");
  }
  return display;
};

describe("effect spotlight display", () => {
  it("creates a timed display model for a combat playback entry", () => {
    const entry = {
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

    const model = effectSpotlightDisplayForEntry({
      nowMs: 10_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry,
      pendingDecisionId: undefined,
    });

    expect(model?.entry).toEqual(entry);
    expect(model?.active).toBeUndefined();
    expect(model?.combat?.eventKind).toBe("attackDeclared");
    expect(model?.shownAtMs).toBe(10_000);
    expect(model?.visibleUntilMs).toBe(12_000);
    expect(model?.pinned).toBe(false);
  });

  it("starts a fresh dwell when rewinding to an entry that was displayed before", () => {
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
      nowMs: 10_000,
      previous,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: source("event:first", "span:first"),
      pendingDecisionId: undefined,
      cursorVersion: 2,
      previousCursorVersion: 1,
    });

    expect(display?.shownAtMs).toBe(10_000);
    expect(display?.visibleUntilMs).toBe(12_000);
  });

  it("pins live entries by structured pending decision id instead of key text", () => {
    const display = effectSpotlightDisplayForEntry({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: {
        ...source("not-a-decision-prefix", "span:pending", "live"),
        pendingDecisionId: publicPendingId("spotlight:pending:decision-1"),
        status: "pending",
      },
      pendingDecisionId: publicPendingId("spotlight:pending:decision-1"),
      cursorVersion: 1,
      previousCursorVersion: undefined,
    });

    expect(display?.pinned).toBe(true);
  });

  it("does not pin live entries from key text without a structured pending decision id", () => {
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
      // @ts-expect-error raw decision ids must not be accepted as spotlight pinning ids.
      pendingDecisionId: "decision-1",
      cursorVersion: 1,
      previousCursorVersion: undefined,
    });

    expect(display?.activeKey).toBe(
      "decision:decision-1|source-1||span:pending",
    );
    expect(display?.pinned).toBe(false);
  });

  it("starts fresh dwell when the authored cursor entry changes", () => {
    const previousEntry = source(
      "event:search:pending",
      "span:search:selection",
    );
    const finalEvent = source(
      "event:search:selection",
      "span:search:selection",
    );
    const previous: EffectSpotlightState = {
      entry: previousEntry,
      active: previousEntry.active,
      activeKey: previousEntry.key,
      activeMode: "resolved",
      sourceInstanceId: "source-1",
      activeSpanIds: ["span:search:selection"],
      shownAtMs: 1_000,
      visibleUntilMs: 3_000,
      pinned: false,
      cursorVersion: 1,
    };

    const display = effectSpotlightDisplayForEntry({
      nowMs: 1_500,
      previous,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: finalEvent,
      pendingDecisionId: undefined,
      cursorVersion: 1,
    });

    expect(display?.activeKey).toBe("event:search:selection");
    expect(display?.shownAtMs).toBe(1_500);
    expect(display?.visibleUntilMs).toBe(3_500);
  });

  it("starts fresh dwell when a live pending entry advances to a resolved entry", () => {
    const live = source(
      "spotlight:pending:search-select:0",
      "span:search:selection",
      "live",
    );
    const finalEvent = source(
      "event:search:selection",
      "span:search:selection",
    );
    const previous: EffectSpotlightState = {
      entry: live,
      active: live.active,
      activeKey: live.key,
      activeMode: "live",
      sourceInstanceId: "source-1",
      activeSpanIds: ["span:search:selection"],
      shownAtMs: 1_000,
      visibleUntilMs: 3_000,
      pinned: true,
      cursorVersion: 1,
    };

    const display = effectSpotlightDisplayForEntry({
      nowMs: 1_500,
      previous,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: finalEvent,
      pendingDecisionId: undefined,
      cursorVersion: 1,
    });

    expect(display?.activeKey).toBe("event:search:selection");
    expect(display?.activeMode).toBe("resolved");
    expect(display?.shownAtMs).toBe(1_500);
    expect(display?.visibleUntilMs).toBe(3_500);
    expect(display?.pinned).toBe(false);
  });

  it("ignores semanticKey changes for timer identity and dwell", () => {
    const first = source("event:search:selection", "span:search:selection");
    const changedSemantic = {
      ...first,
      semanticKey: "changed-diagnostic-semantic-key",
    };
    const firstDisplay = effectSpotlightDisplayForEntry({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: first,
      pendingDecisionId: undefined,
      cursorVersion: 1,
    });
    const changedDisplay = effectSpotlightDisplayForEntry({
      nowMs: 1_500,
      previous: firstDisplay,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: changedSemantic,
      pendingDecisionId: undefined,
      cursorVersion: 1,
    });
    const remainderDisplay = effectSpotlightDisplayForEntry({
      nowMs: 3_000,
      previous: changedDisplay,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: source("event:search:remaining", "span:search:remaining"),
      pendingDecisionId: undefined,
      cursorVersion: 2,
      previousCursorVersion: 1,
    });

    const firstState = requireDisplay(firstDisplay);
    const changedState = requireDisplay(changedDisplay);
    const remainderState = requireDisplay(remainderDisplay);
    expect(changedState.shownAtMs).toBe(1_000);
    expect(effectSpotlightTimerAnimationKey(firstState)).toBe(
      effectSpotlightTimerAnimationKey(changedState),
    );
    expect(effectSpotlightTimerAnimationKey(remainderState)).not.toBe(
      effectSpotlightTimerAnimationKey(changedState),
    );
  });

  it("keeps dwell when target links change for the same authored entry", () => {
    const untargeted = source("event:targeting", "span:body");
    const targeted = {
      ...untargeted,
      active: {
        ...untargeted.active,
        targetLinks: [
          {
            spanId: "span:body" as EffectTextSpanId,
            relation: "selectedTarget" as const,
            cards: [target],
          },
        ],
      },
    };
    const previous: EffectSpotlightState = {
      entry: untargeted,
      active: untargeted.active,
      activeKey: untargeted.key,
      activeMode: "resolved",
      sourceInstanceId: "source-1",
      activeSpanIds: ["span:body"],
      shownAtMs: 1_000,
      visibleUntilMs: 3_000,
      pinned: false,
      cursorVersion: 1,
    };

    const display = effectSpotlightDisplayForEntry({
      nowMs: 1_500,
      previous,
      minimumDwellMs: 2_000,
      graceMs: 800,
      entry: targeted,
      pendingDecisionId: undefined,
      cursorVersion: 1,
    });

    expect(display?.shownAtMs).toBe(1_000);
    expect(display?.visibleUntilMs).toBe(3_000);
    expect(display?.active?.targetLinks).toEqual(targeted.active.targetLinks);
  });
});
