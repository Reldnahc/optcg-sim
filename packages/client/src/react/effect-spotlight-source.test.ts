import { describe, expect, it } from "vitest";

import type {
  CardId,
  DecisionId,
  EngineEvent,
  InstanceId,
  PlayerId,
  PlayerView,
} from "@optcg/types";

import {
  activeEffectTextForSpotlight,
  activeEffectTextSourceForSpotlight,
} from "./effect-spotlight-source.js";

const source = {
  instanceId: "source-1" as InstanceId,
  cardId: "OP00-001" as CardId,
  playerId: "p1" as PlayerId,
};

const event = (
  overrides: Partial<EngineEvent> & Pick<EngineEvent, "type" | "seq">,
): EngineEvent => ({
  id: `event:${String(overrides.seq)}:${overrides.type}` as EngineEvent["id"],
  payload: {},
  visibility: { type: "public" },
  createdAtStateSeq: 1 as EngineEvent["createdAtStateSeq"],
  ...overrides,
});

describe("activeEffectTextForSpotlight", () => {
  it("uses active view text before resolved event presentation", () => {
    const activeEffectText: NonNullable<PlayerView["activeEffectText"]> = {
      source,
      textKind: "effect",
      activeSpanIds: ["span:pending"],
    };

    expect(
      activeEffectTextForSpotlight({
        activeEffectText,
        pendingDecision: undefined,
        events: [
          event({
            type: "effectResolved",
            seq: 1,
            payload: {
              status: "resolved",
              presentation: {
                source,
                textKind: "effect",
                activeSpanIds: ["span:resolved"],
              },
            },
          }),
        ],
      }),
    ).toEqual(activeEffectText);
  });

  it("uses pending decision active text before top-level active text", () => {
    const activeEffectText: NonNullable<PlayerView["activeEffectText"]> = {
      source,
      textKind: "effect",
      activeSpanIds: ["span:body"],
    };
    const pendingActiveEffectText: NonNullable<
      PlayerView["pendingDecision"]
    >["presentation"]["activeEffectText"] = {
      source,
      textKind: "effect",
      activeSpanIds: ["span:cost:optional"],
    };

    expect(
      activeEffectTextForSpotlight({
        activeEffectText,
        pendingDecision: {
          id: "decision:payCost:1" as DecisionId,
          type: "chooseQuantity",
          playerId: "p1" as PlayerId,
          prompt: "Pay cost?",
          causedBy: { type: "ruleProcess", name: "cost" },
          presentation: {
            title: "Pay cost",
            instruction: "Pay cost?",
            activeEffectText: pendingActiveEffectText,
          },
          mode: "upTo",
          min: 0,
          max: 1,
        },
        events: [],
      }),
    ).toEqual(pendingActiveEffectText);
  });

  it("falls back to the newest resolved effect presentation", () => {
    expect(
      activeEffectTextForSpotlight({
        activeEffectText: undefined,
        pendingDecision: undefined,
        events: [
          event({
            type: "effectResolved",
            seq: 1,
            payload: {
              status: "resolved",
              presentation: {
                source,
                textKind: "effect",
                activeSpanIds: ["span:old"],
              },
            },
          }),
          event({
            type: "effectResolved",
            seq: 2,
            payload: {
              status: "resolved",
              presentation: {
                source,
                textKind: "effect",
                activeSpanIds: ["span:new"],
              },
            },
          }),
        ],
      }),
    ).toEqual({
      source,
      textKind: "effect",
      activeSpanIds: ["span:new"],
    });
  });

  it("marks resolved event presentations as one-shot sources keyed by event id", () => {
    const resolved = event({
      type: "effectResolved",
      seq: 2,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:new"],
        },
      },
    });

    expect(
      activeEffectTextSourceForSpotlight({
        activeEffectText: undefined,
        pendingDecision: undefined,
        events: [resolved],
      }),
    ).toEqual({
      active: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:new"],
      },
      key: String(resolved.id),
      mode: "resolved",
    });
  });

  it("does not fall back to a resolved effect while another decision is pending", () => {
    const resolved = event({
      type: "effectResolved",
      seq: 2,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:new"],
        },
      },
    });

    expect(
      activeEffectTextSourceForSpotlight({
        activeEffectText: undefined,
        pendingDecision: {
          id: "decision:counter:1" as DecisionId,
          type: "chooseQuantity",
          playerId: "p1" as PlayerId,
          prompt: "Counter?",
          causedBy: { type: "ruleProcess", name: "counterStep" },
          presentation: { title: "Counter?", instruction: "Counter?" },
          mode: "upTo",
          min: 0,
          max: 1,
        },
        events: [resolved],
      }),
    ).toBeUndefined();
  });
});
