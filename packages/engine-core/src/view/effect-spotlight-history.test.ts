import { describe, expect, it } from "vitest";

import type {
  CardId,
  EffectTextSpanId,
  EngineEvent,
  EngineEventId,
  InstanceId,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import { effectSpotlightHistoryFromPlayerViewState } from "./effect-spotlight-history.js";

const source = {
  playerId: "p1" as PlayerId,
  instanceId: "source-1" as InstanceId,
  cardId: "OP00-001" as CardId,
};

const resolvedSearchEvent = (
  id: string,
  activeSpanIds: readonly EffectTextSpanId[],
): EngineEvent => ({
  id: id as EngineEventId,
  seq: 1,
  type: "effectResolved",
  source,
  payload: {
    status: "resolved",
    presentation: {
      source,
      textKind: "effect",
      activeSpanIds,
    },
  },
  visibility: { type: "public" },
  createdAtStateSeq: 1 as StateSeq,
});

describe("effectSpotlightHistoryFromPlayerViewState", () => {
  it("projects current search remainder as the live present entry without duplicating it", () => {
    const event = resolvedSearchEvent("event:search", [
      "span:search:selection",
      "span:search:remaining",
    ]);

    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:search:remaining"],
      },
      events: [event],
      pendingDecisionId: "decision:orderCards:search",
    });

    expect(history).toEqual({
      entries: [
        {
          key: "event:search:span:search:selection",
          mode: "resolved",
          active: {
            source,
            textKind: "effect",
            activeSpanIds: ["span:search:selection"],
          },
        },
        {
          key: "decision:decision:orderCards:search|source-1|effect|span:search:remaining",
          mode: "live",
          active: {
            source,
            textKind: "effect",
            activeSpanIds: ["span:search:remaining"],
          },
        },
      ],
      presentKey:
        "decision:decision:orderCards:search|source-1|effect|span:search:remaining",
    });
  });
});
