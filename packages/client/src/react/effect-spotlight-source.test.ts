import { describe, expect, it } from "vitest";

import type {
  ActiveEffectTextPresentation,
  CardId,
  DecisionId,
  EngineEvent,
  EngineEventId,
  InstanceId,
  PlayerId,
  PlayerView,
} from "@optcg/types";

import {
  activeEffectTextSourcesForSpotlight,
  activeEffectTextSourceForSpotlight,
  resolvedEffectTextSourcesForSpotlight,
} from "./effect-spotlight-source.js";

const source = {
  instanceId: "source-1" as InstanceId,
  cardId: "OP00-001" as CardId,
  playerId: "p1" as PlayerId,
};

const otherSource = {
  instanceId: "source-2" as InstanceId,
  cardId: "OP00-002" as CardId,
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

describe("legacy activeEffectTextForSpotlight fallback", () => {
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

  it("returns structured pending decision fallback sources", () => {
    const pendingActiveEffectText: NonNullable<
      PlayerView["pendingDecision"]
    >["presentation"]["activeEffectText"] = {
      source,
      textKind: "effect",
      activeSpanIds: ["span:cost:optional"],
    };

    expect(
      activeEffectTextSourceForSpotlight({
        activeEffectText: undefined,
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
    ).toMatchObject({
      id: "decision:decision:payCost:1|source-1|effect|span:cost:optional",
      key: "decision:decision:payCost:1|source-1|effect|span:cost:optional",
      semanticKey: "p1|source-1|OP00-001|effect|span:cost:optional",
      status: "pending",
      pendingDecisionId: "decision:payCost:1",
    });
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
        id: String(first.id),
        key: String(first.id),
        semanticKey: "p1|source-1|OP00-001|effect|span:first",
        mode: "resolved",
        status: "resolved",
      },
      {
        active: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:second"],
        },
        id: String(second.id),
        key: String(second.id),
        semanticKey: "p1|source-1|OP00-001|effect|span:second",
        mode: "resolved",
        status: "resolved",
      },
    ]);
  });

  it("ignores combat-shaped presentations in legacy effect text fallback", () => {
    expect(
      resolvedEffectTextSourcesForSpotlight([
        event({
          type: "effectResolved",
          seq: 1,
          payload: {
            status: "resolved",
            presentation: {
              kind: "combat",
              id: "combat:event:attack",
              key: "event:attack",
              semanticKey:
                "combat|attackDeclared|p1|attacker-1|OP00-003|p2|defender-1|OP00-004|7000|5000",
              mode: "resolved",
              status: "resolved",
              combat: {
                eventKind: "attackDeclared",
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
            },
          },
        }),
      ]),
    ).toEqual([]);
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

  it("splits resolved choice option spans into queueable spotlight sources", () => {
    const resolved = event({
      type: "effectResolved",
      seq: 1,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: [
            "span:choice",
            "span:choice:0:body",
            "span:choice:1:body",
          ],
        },
      },
    });

    const sources = resolvedEffectTextSourcesForSpotlight([resolved]);

    expect(sources.map((candidate) => candidate.key)).toEqual([
      `${String(resolved.id)}:span:choice:0:body`,
      `${String(resolved.id)}:span:choice:1:body`,
    ]);
    expect(sources.map((candidate) => candidate.active.activeSpanIds)).toEqual([
      ["span:choice:0:body"],
      ["span:choice:1:body"],
    ]);
  });

  it("splits resolved cost and body spans into queueable spotlight sources", () => {
    const resolved = event({
      type: "effectResolved",
      seq: 1,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:cost:optional", "span:body"],
        },
      },
    });

    const sources = resolvedEffectTextSourcesForSpotlight([resolved]);

    expect(sources.map((candidate) => candidate.key)).toEqual([
      `${String(resolved.id)}:span:cost:optional`,
      `${String(resolved.id)}:span:body`,
    ]);
    expect(sources.map((candidate) => candidate.active.activeSpanIds)).toEqual([
      ["span:cost:optional"],
      ["span:body"],
    ]);
  });

  it("uses resolved search segments instead of the live whole-effect spotlight while an effect is active", () => {
    const activeEffectText: NonNullable<PlayerView["activeEffectText"]> = {
      source,
      textKind: "effect",
      activeSpanIds: ["span:search:selection", "span:search:remaining"],
    };
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

    const sources = activeEffectTextSourcesForSpotlight({
      activeEffectText,
      pendingDecision: undefined,
      events: [resolved],
    });

    expect(sources.map((candidate) => candidate.key)).toEqual([
      `${String(resolved.id)}:span:search:selection`,
      `${String(resolved.id)}:span:search:remaining`,
    ]);
    expect(sources.map((candidate) => candidate.active.activeSpanIds)).toEqual([
      ["span:search:selection"],
      ["span:search:remaining"],
    ]);
  });

  it("does not return live active text beside a matching latest resolved presentation", () => {
    const activeEffectText: NonNullable<PlayerView["activeEffectText"]> = {
      source,
      textKind: "effect",
      activeSpanIds: ["span:body"],
    };
    const resolved = event({
      type: "effectResolved",
      seq: 1,
      payload: {
        status: "resolved",
        presentation: activeEffectText,
      },
    });

    const sources = activeEffectTextSourcesForSpotlight({
      activeEffectText,
      pendingDecision: undefined,
      events: [resolved],
    });

    expect(sources.map((candidate) => candidate.key)).toEqual([
      String(resolved.id),
    ]);
  });

  it("keeps live active text after a newer effect queued event", () => {
    const activeEffectText: NonNullable<PlayerView["activeEffectText"]> = {
      source,
      textKind: "effect",
      activeSpanIds: ["span:body"],
    };
    const resolved = event({
      type: "effectResolved",
      seq: 1,
      payload: {
        status: "resolved",
        presentation: activeEffectText,
      },
    });

    const sources = activeEffectTextSourcesForSpotlight({
      activeEffectText,
      pendingDecision: undefined,
      events: [resolved, event({ type: "effectQueued", seq: 2 })],
    });

    expect(sources.map((candidate) => candidate.key)).toEqual([
      String(resolved.id),
      `active|${String(source.instanceId)}|effect|span:body`,
    ]);
  });

  it("keeps earlier resolved spotlights while an active effect exposes split resolved spans", () => {
    const activeEffectText: NonNullable<PlayerView["activeEffectText"]> = {
      source,
      textKind: "effect",
      activeSpanIds: ["span:search:selection", "span:search:remaining"],
    };
    const earlier = event({
      type: "effectResolved",
      seq: 1,
      payload: {
        status: "resolved",
        presentation: {
          source: otherSource,
          textKind: "effect",
          activeSpanIds: ["span:other"],
        },
      },
    });
    const split = event({
      type: "effectResolved",
      seq: 2,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:search:selection", "span:search:remaining"],
        },
      },
    });

    expect(
      activeEffectTextSourcesForSpotlight({
        activeEffectText,
        pendingDecision: undefined,
        events: [earlier, split],
      }).map((candidate) => candidate.key),
    ).toEqual([
      String(earlier.id),
      `${String(split.id)}:span:search:selection`,
      `${String(split.id)}:span:search:remaining`,
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
      id: String(resolved.id),
      key: String(resolved.id),
      semanticKey: "p1|source-1|OP00-001|effect|span:new",
      mode: "resolved",
      status: "resolved",
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
      id: String(replacement.id),
      key: String(replacement.id),
      semanticKey: "p1|source-1|OP00-001|effect|span:replacement",
      mode: "resolved",
      status: "resolved",
    });
  });

  it("creates a no-highlight spotlight for a played character", () => {
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
      id: String(played.id),
      key: String(played.id),
      semanticKey: "p1|played-1|OP00-002|effect|",
      mode: "resolved",
      status: "resolved",
    });
  });

  it("ignores resolved spotlight presentations without active spans", () => {
    expect(
      resolvedEffectTextSourcesForSpotlight([
        event({
          type: "effectResolved",
          seq: 1,
          payload: {
            status: "resolved",
            presentation: {
              source,
              textKind: "effect",
              activeSpanIds: [],
            },
          },
        }),
      ]),
    ).toEqual([]);
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

  it("keeps resolved spotlight sources ahead of pending decision active text", () => {
    const pendingActiveEffectText: NonNullable<
      PlayerView["pendingDecision"]
    >["presentation"]["activeEffectText"] = {
      source,
      textKind: "effect",
      activeSpanIds: ["span:decision"],
    };
    const resolved = event({
      type: "effectResolved",
      seq: 2,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:resolved"],
        },
      },
    });

    expect(
      activeEffectTextSourcesForSpotlight({
        activeEffectText: undefined,
        pendingDecision: {
          id: "decision:selectTargets:1" as DecisionId,
          type: "selectTargets",
          playerId: "p1" as PlayerId,
          prompt: "Select target.",
          causedBy: { type: "ruleProcess", name: "effect" },
          presentation: {
            title: "Select target",
            instruction: "Select target.",
            activeEffectText: pendingActiveEffectText,
          },
          min: 0,
          max: 1,
          candidates: [],
        },
        events: [resolved],
      }).map((candidate) => candidate.key),
    ).toEqual([
      String(resolved.id),
      `decision:decision:selectTargets:1|${String(source.instanceId)}|effect|span:decision`,
    ]);
  });

  it("does not create a resolved spotlight after a declined cost decision", () => {
    const resolved = event({
      type: "effectResolved",
      seq: 3,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:body"],
        },
      },
    });

    expect(
      resolvedEffectTextSourcesForSpotlight([
        event({
          type: "decisionResolved",
          seq: 2,
          payload: {
            decisionId: "decision:payCost:1",
            decisionType: "payCost",
            playerId: "p1",
            responseType: "paymentDeclined",
            status: "resolved",
          },
        }),
        resolved,
      ]),
    ).toEqual([]);
  });

  it("keeps a resolved spotlight after choosing zero targets", () => {
    const resolved = event({
      type: "effectResolved",
      seq: 3,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:body:rest"],
        },
      },
    });

    expect(
      resolvedEffectTextSourcesForSpotlight([
        event({
          type: "decisionResolved",
          seq: 2,
          payload: {
            decisionId: "decision:selectTargets:1",
            decisionType: "selectTargets",
            playerId: "p1",
            responseType: "targets",
            selectedCount: 0,
            status: "resolved",
          },
        }),
        resolved,
      ]).map((candidate) => candidate.key),
    ).toEqual([String(resolved.id)]);
  });

  it("keeps a resolved spotlight after choosing zero cards", () => {
    const resolved = event({
      type: "effectResolved",
      seq: 3,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:search:remaining"],
        },
      },
    });

    expect(
      resolvedEffectTextSourcesForSpotlight([
        event({
          type: "decisionResolved",
          seq: 2,
          payload: {
            decisionId: "decision:selectCards:1",
            decisionType: "selectCards",
            playerId: "p1",
            responseType: "cards",
            selectedCount: 0,
            status: "resolved",
          },
        }),
        resolved,
      ]).map((candidate) => candidate.key),
    ).toEqual([String(resolved.id)]);
  });

  it("keeps a resolved spotlight when gameplay events happen after zero target selection", () => {
    const resolved = event({
      type: "effectResolved",
      seq: 4,
      payload: {
        status: "resolved",
        presentation: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:body"],
        },
      },
    });

    expect(
      resolvedEffectTextSourcesForSpotlight([
        event({
          type: "decisionResolved",
          seq: 2,
          payload: {
            decisionId: "decision:selectTargets:1",
            decisionType: "selectTargets",
            playerId: "p1",
            responseType: "targets",
            selectedCount: 0,
            status: "resolved",
          },
        }),
        event({
          type: "cardDrawn",
          seq: 3,
          payload: {},
        }),
        resolved,
      ]).map((candidate) => candidate.key),
    ).toEqual([String(resolved.id)]);
  });
});
