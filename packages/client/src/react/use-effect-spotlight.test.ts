import { describe, expect, it } from "vitest";

import type {
  CardId,
  EffectTextSpanId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import {
  consumeResolvedSpotlightSourceKeys,
  consumeSpotlightSourceSignatures,
  effectSpotlightModel,
  queuedResolvedSpotlightSources,
  shouldDisplayLiveSpotlightSource,
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

  it("does not queue resolved spans that were already displayed live", () => {
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
