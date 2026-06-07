import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EffectTextSpanId,
  GameState,
} from "@optcg/types";

import {
  must,
  p1,
  processEffectRuntime,
  queueingState,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnPlayDefinition,
  toEffectId,
} from "../effect-runtime-queue/test-support.js";

const drawThenLucyLeaderBuff = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "draw-two",
      connector: "always",
      effect: { type: "draw", player: "self", count: 2 },
    },
    {
      id: "lucy-leader-buffs",
      connector: "then",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "giveKeyword",
              target: {
                type: "all",
                zone: "leaderArea",
                player: "self",
                filter: { categories: ["leader"], names: ["Lucy"] },
              },
              keyword: "doubleAttack",
              duration: { type: "thisTurn" },
            },
          },
          {
            connector: "always",
            effect: {
              type: "modifyPower",
              target: {
                type: "all",
                zone: "leaderArea",
                player: "self",
                filter: { categories: ["leader"], names: ["Lucy"] },
              },
              value: 3000,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  ],
});

const drawThenPreventDraw = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      connector: "then",
      effect: {
        type: "preventDraw",
        player: "self",
        source: "ownEffects",
        duration: { type: "thisTurn" },
      },
    },
  ],
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-completed-sequence-presentation";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "completed-sequence-presentation-rules",
      sourceTextHash: "completed-sequence-presentation-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-completed-sequence-presentation"),
        effect,
      },
    ],
  };
  setupOnPlayDefinition(state, source, definition, effectDefinitionId);
  return definition;
};

test("completed no-decision sequence preserves changed segment spans in order", () => {
  const { state, played } = queueingState();
  const p1State = must(state.players[p1], "p1");
  setupSequenceDefinition(state, played, drawThenLucyLeaderBuff());
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
  });
  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  const queuedEntry = must(queued.state.effectQueue[0], "queued effect");
  const queuedState = {
    ...queued.state,
    effectQueue: [
      {
        ...queuedEntry,
        presentation: {
          source: queuedEntry.source,
          textKind: "effect" as const,
          activeSpanIds: [
            "span:sequence:0:body",
            "span:sequence:1:body",
          ] as EffectTextSpanId[],
        },
      },
    ],
  };

  const result = processEffectRuntime(queuedState);
  assert.equal(result.errors, undefined);
  const effectResolved = must(
    result.events.find((event) => event.type === "effectResolved"),
    "effectResolved event",
  );

  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(
    (effectResolved.payload as { presentation?: unknown }).presentation,
    {
      source: queuedEntry.source,
      textKind: "effect" as const,
      activeSpanIds: ["span:sequence:0:body"],
    },
  );
});

test("completed draw-then-prevent-draw sequence preserves both changed segment spans", () => {
  const { state, played } = queueingState();
  setupSequenceDefinition(state, played, drawThenPreventDraw());
  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  const queuedEntry = must(queued.state.effectQueue[0], "queued effect");
  const queuedState = {
    ...queued.state,
    effectQueue: [
      {
        ...queuedEntry,
        presentation: {
          source: queuedEntry.source,
          textKind: "effect" as const,
          activeSpanIds: [
            "span:sequence:0:body",
            "span:sequence:1:body",
          ] as EffectTextSpanId[],
        },
      },
    ],
  };

  const result = processEffectRuntime(queuedState);
  assert.equal(result.errors, undefined);
  const effectResolved = must(
    result.events.find((event) => event.type === "effectResolved"),
    "effectResolved event",
  );

  assert.deepEqual(
    (effectResolved.payload as { presentation?: unknown }).presentation,
    {
      source: queuedEntry.source,
      textKind: "effect" as const,
      activeSpanIds: ["span:sequence:0:body", "span:sequence:1:body"],
    },
  );
});
