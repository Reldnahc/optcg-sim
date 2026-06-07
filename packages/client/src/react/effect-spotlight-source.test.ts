import { describe, expect, it } from "vitest";

import type {
  ActiveEffectTextPresentation,
  CardId,
  DecisionId,
  EngineEvent,
  InstanceId,
  PlayerId,
  PlayerView,
} from "@optcg/types";

import {
  activeEffectTextSourceForSpotlight,
  resolvedEffectTextSourcesForSpotlight,
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

const activeEffectTextForSpotlight = (input: {
  readonly activeEffectText: PlayerView["activeEffectText"];
  readonly pendingDecision: PlayerView["pendingDecision"];
  readonly events: readonly EngineEvent[];
}): ActiveEffectTextPresentation | undefined =>
  activeEffectTextSourceForSpotlight(input)?.active;

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

  it("returns resolved spotlight sources in event order for queueing", () => {
    const first = event({
      type: "effectResolved",
      seq: 1,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:first"],
        },
      },
    });
    const second = event({
      type: "effectResolved",
      seq: 2,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:second"],
        },
      },
    });

    expect(resolvedEffectTextSourcesForSpotlight([first, second])).toEqual([
      {
        active: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:first"],
        },
        key: String(first.id),
        mode: "resolved",
      },
      {
        active: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:second"],
        },
        key: String(second.id),
        mode: "resolved",
      },
    ]);
  });

  it("keeps earlier resolved spotlights when another effect queues before the next one resolves", () => {
    const first = event({
      type: "effectResolved",
      seq: 2,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:first"],
        },
      },
    });
    const second = event({
      type: "effectResolved",
      seq: 4,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:second"],
        },
      },
    });

    expect(
      resolvedEffectTextSourcesForSpotlight([
        event({ type: "effectQueued", seq: 1 }),
        first,
        event({ type: "effectQueued", seq: 3 }),
        second,
      ]).map((candidate) => candidate.key),
    ).toEqual([String(first.id), String(second.id)]);
  });

  it("splits resolved sequence spans into queueable spotlight sources", () => {
    const resolved = event({
      type: "effectResolved",
      seq: 1,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:sequence:0:body", "span:sequence:1:body"],
        },
      },
    });

    const sources = resolvedEffectTextSourcesForSpotlight([resolved]);

    expect(sources.map((candidate) => candidate.key)).toEqual([
      `${String(resolved.id)}:span:sequence:0:body`,
      `${String(resolved.id)}:span:sequence:1:body`,
    ]);
    expect(sources.map((candidate) => candidate.active.activeSpanIds)).toEqual([
      ["span:sequence:0:body"],
      ["span:sequence:1:body"],
    ]);
  });

  it("splits resolved search spans into queueable spotlight sources", () => {
    const resolved = event({
      type: "effectResolved",
      seq: 1,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:search:selection", "span:search:remaining"],
        },
      },
    });

    const sources = resolvedEffectTextSourcesForSpotlight([resolved]);

    expect(sources.map((candidate) => candidate.key)).toEqual([
      `${String(resolved.id)}:span:search:selection`,
      `${String(resolved.id)}:span:search:remaining`,
    ]);
    expect(sources.map((candidate) => candidate.active.activeSpanIds)).toEqual([
      ["span:search:selection"],
      ["span:search:remaining"],
    ]);
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

  it("falls back to the newest replacement applied presentation", () => {
    const replacement = event({
      type: "replacementApplied",
      seq: 2,
      payload: {
        status: "applied",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:replacement"],
        },
      },
    });

    expect(
      activeEffectTextSourceForSpotlight({
        activeEffectText: undefined,
        pendingDecision: undefined,
        events: [replacement],
      }),
    ).toEqual({
      active: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:replacement"],
      },
      key: String(replacement.id),
      mode: "resolved",
    });
  });

  it("falls back to a no-highlight spotlight for the newest played character", () => {
    const played = event({
      type: "cardPlayed",
      seq: 2,
      payload: {
        playerId: "p1",
        instanceId: "played-1",
        cardId: "OP00-002",
        category: "character",
      },
    });

    expect(
      activeEffectTextSourceForSpotlight({
        activeEffectText: undefined,
        pendingDecision: undefined,
        events: [played],
      }),
    ).toEqual({
      active: {
        source: {
          playerId: "p1",
          instanceId: "played-1",
          cardId: "OP00-002",
        },
        textKind: "effect",
        activeSpanIds: [],
      },
      key: String(played.id),
      mode: "resolved",
    });
  });

  it("does not use Event card plays as field-entry spotlights", () => {
    expect(
      activeEffectTextSourceForSpotlight({
        activeEffectText: undefined,
        pendingDecision: undefined,
        events: [
          event({
            type: "cardPlayed",
            seq: 2,
            payload: {
              playerId: "p1",
              instanceId: "played-event-1",
              cardId: "OP00-003",
              category: "event",
            },
          }),
        ],
      }),
    ).toBeUndefined();
  });

  it("does not show a no-highlight play spotlight when the play queued an effect", () => {
    expect(
      activeEffectTextSourceForSpotlight({
        activeEffectText: undefined,
        pendingDecision: undefined,
        events: [
          event({
            type: "cardPlayed",
            seq: 2,
            payload: {
              playerId: "p1",
              instanceId: "played-1",
              cardId: "OP00-002",
              category: "character",
            },
          }),
          event({
            type: "effectQueued",
            seq: 3,
            source,
          }),
        ],
      }),
    ).toBeUndefined();
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
