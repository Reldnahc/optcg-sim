import { describe, expect, it } from "vitest";

import type {
  CardId,
  DecisionId,
  EffectTextSpanId,
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

describe("effect spotlight display", () => {
  it("starts a fresh dwell when rewinding to an entry that was displayed before", () => {
    const previous: EffectSpotlightState = {
      active: source("event:first", "span:first").active,
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
});
