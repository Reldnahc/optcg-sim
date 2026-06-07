import { describe, expect, it } from "vitest";

import type {
  CardId,
  EngineEvent,
  InstanceId,
  PlayerId,
  PlayerView,
} from "@optcg/types";

import { activeEffectTextForSpotlight } from "./effect-spotlight-source.js";

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
});
