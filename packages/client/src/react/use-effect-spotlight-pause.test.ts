import { describe, expect, it } from "vitest";

import type {
  CardId,
  EffectTextSpanId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import {
  resumeSpotlightModelAfterPause,
  type EffectSpotlightState,
} from "./use-effect-spotlight.js";

const source = (key: string, spanId: EffectTextSpanId) => ({
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
  mode: "resolved" as const,
  status: "resolved" as const,
});

const model = ({
  shownAtMs,
  visibleUntilMs,
}: {
  readonly shownAtMs: number;
  readonly visibleUntilMs: number;
}): EffectSpotlightState => {
  const entry = source("event:first", "span:first");
  return {
    entry,
    active: entry.active,
    activeKey: "event:first",
    activeMode: "resolved",
    sourceInstanceId: "source-1",
    activeSpanIds: ["span:first"],
    shownAtMs,
    visibleUntilMs,
    pinned: false,
  };
};

describe("effect spotlight pause timing", () => {
  it("preserves current spotlight timing progress when playback resumes", () => {
    const resumed = resumeSpotlightModelAfterPause({
      model: model({ shownAtMs: 1_000, visibleUntilMs: 3_000 }),
      pausedAtMs: 1_500,
      resumedAtMs: 5_000,
    });

    expect(resumed?.shownAtMs).toBe(4_500);
    expect(resumed?.visibleUntilMs).toBe(6_500);
  });

  it("resumes a spotlight created while paused from that spotlight start time", () => {
    const resumed = resumeSpotlightModelAfterPause({
      model: model({ shownAtMs: 1_500, visibleUntilMs: 3_500 }),
      pausedAtMs: 1_000,
      resumedAtMs: 5_000,
    });

    expect(resumed?.shownAtMs).toBe(5_000);
    expect(resumed?.visibleUntilMs).toBe(7_000);
  });
});
