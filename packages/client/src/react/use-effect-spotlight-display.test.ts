import { describe, expect, it } from "vitest";

import type {
  CardId,
  CardRef,
  DecisionId,
  EffectTextSpanId,
  EngineEventId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import {
  effectSpotlightDisplayForEntry,
  type EffectSpotlightState,
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

const target: CardRef = {
  playerId: "p2" as PlayerId,
  instanceId: "target-1" as InstanceId,
  cardId: "OP00-002" as CardId,
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
        pendingDecisionId: "decision-1" as DecisionId,
        status: "pending",
      },
      pendingDecisionId: "decision-1",
      cursorVersion: 1,
      previousCursorVersion: undefined,
    });

    expect(display?.pinned).toBe(true);
  });

  it("keeps dwell when a completed-frame projection becomes its final event", () => {
    const completed = source(
      "completed-frame:queue:effect:decision:span:search:selection",
      "span:search:selection",
    );
    const finalEvent = source(
      "event:search:selection",
      "span:search:selection",
    );
    const previous: EffectSpotlightState = {
      entry: completed,
      active: completed.active,
      activeKey: completed.key,
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
    expect(display?.shownAtMs).toBe(1_000);
    expect(display?.visibleUntilMs).toBe(3_000);
  });

  it("keeps dwell when a live pending entry becomes its final event", () => {
    const live = source(
      "decision:search-select|source-1|effect|span:search:selection",
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
    expect(display?.shownAtMs).toBe(1_000);
    expect(display?.visibleUntilMs).toBe(3_000);
    expect(display?.pinned).toBe(false);
  });

  it("starts fresh dwell when target links are added to the current entry", () => {
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

    expect(display?.shownAtMs).toBe(1_500);
    expect(display?.visibleUntilMs).toBe(3_500);
    expect(display?.active?.targetLinks).toEqual(targeted.active.targetLinks);
  });
});
