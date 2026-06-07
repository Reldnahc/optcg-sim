import { describe, expect, it } from "vitest";

import type {
  CardId,
  EffectTextSpanId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import {
  effectSpotlightModel,
  queuedResolvedSpotlightSources,
} from "./use-effect-spotlight.js";

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
});
