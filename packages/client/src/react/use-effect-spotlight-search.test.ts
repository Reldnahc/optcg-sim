import { describe, expect, it } from "vitest";

import type {
  CardId,
  EffectTextSpanId,
  InstanceId,
  PlayerId,
  PublicPendingDecisionId,
} from "@optcg/types";

import {
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
  effectSpotlightModelForPlayback,
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

const publicPendingId = (value: string): PublicPendingDecisionId =>
  value as PublicPendingDecisionId;

describe("effect spotlight search lifecycle", () => {
  it("keeps search selection for dwell, then advances to pending remainder", () => {
    const liveSelection = {
      ...source(
        "decision:select|source-1||span:search:selection",
        "span:search:selection",
        "live",
      ),
      id: "pending:decision:select:p1|source-1|OP00-001|effect|span:search:selection",
      semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
      pendingDecisionId: publicPendingId("spotlight:pending:select"),
    };
    const resolvedSelection = {
      ...source("event:search:span:search:selection", "span:search:selection"),
      id: "resolved:event:search:span:search:selection",
      semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
    };
    const liveRemainder = {
      ...source(
        "decision:order|source-1||span:search:remaining",
        "span:search:remaining",
        "live",
      ),
      id: "pending:decision:order:p1|source-1|OP00-001|effect|span:search:remaining",
      semanticKey: "p1|source-1|OP00-001|effect|span:search:remaining",
      pendingDecisionId: publicPendingId("spotlight:pending:order"),
    };

    const playback = appendSpotlightPlaybackSources({
      previous: {
        entries: [liveSelection],
        cursorIndex: 0,
        paused: false,
        fastForwarded: false,
      },
      sources: [resolvedSelection, liveRemainder],
    });
    const selectionDisplay = effectSpotlightModelForPlayback({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      playback,
      fallbackMode: "live",
      pendingDecisionId: publicPendingId("spotlight:pending:order"),
    });
    const advancedPlayback = advanceSpotlightPlayback({
      command: "autoAdvance",
      state: playback,
    });
    const remainderDisplay = effectSpotlightModelForPlayback({
      nowMs: 3_000,
      previous: selectionDisplay,
      minimumDwellMs: 2_000,
      graceMs: 800,
      playback: advancedPlayback,
      fallbackMode: "live",
      pendingDecisionId: publicPendingId("spotlight:pending:order"),
    });

    expect(playback.entries.map((entry) => entry.key)).toEqual([
      "event:search:span:search:selection",
      "decision:order|source-1||span:search:remaining",
    ]);
    expect(selectionDisplay?.activeSpanIds).toEqual(["span:search:selection"]);
    expect(selectionDisplay?.pinned).toBe(false);
    expect(advancedPlayback.cursorIndex).toBe(1);
    expect(remainderDisplay?.activeSpanIds).toEqual(["span:search:remaining"]);
    expect(remainderDisplay?.pinned).toBe(true);
  });
});
