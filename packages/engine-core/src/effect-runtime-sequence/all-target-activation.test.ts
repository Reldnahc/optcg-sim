import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toCardId,
  toEffectId,
  toInstanceId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-all-target-activation-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "all-target-activation-sequence-rules",
      sourceTextHash: "all-target-activation-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-all-target-activation-sequence"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const sequenceQueueState = (
  effect: Effect,
): { state: GameState; source: CardInstance } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      id: toQueueEntryId("queue-entry-all-target-activation-sequence"),
      state: "pending",
      timingWindowId: toTimingWindowId("window-all-target-activation-sequence"),
      generation: 0,
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 0,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "all-target-activation-test" },
    },
  ];
  return { state, source };
};

test("activate sequence can set your Leader and all Characters active directly", () => {
  const { state, source } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: { type: "activate", target: { type: "myLeader" } },
      },
      {
        connector: "always",
        effect: {
          type: "activate",
          target: {
            type: "all",
            player: "self",
            zone: "characterArea",
            filter: { categories: ["character"] },
          },
        },
      },
    ],
  });
  const p1State = must(state.players[p1], "p1");
  p1State.leader = { ...p1State.leader, state: "rested" };
  const extra = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[0], "extra"),
      cardId: toCardId("activatable-extra-character"),
    },
    zone: "characterArea",
  });
  source.state = "rested";
  extra.state = "rested";
  p1State.characters = [source, extra];
  state.cardManifest.cards[extra.cardId] = resolvedCard({
    cardId: extra.cardId,
    category: "character",
    power: 5000,
  });

  const resolved = processEffectRuntime(state);

  assert.equal(resolved.errors, undefined);
  const afterP1 = must(resolved.state.players[p1], "resolved p1");
  assert.equal(afterP1.leader.state, "active");
  assert.deepEqual(
    afterP1.characters.map((card) => card.state),
    ["active", "active"],
  );
});

test("activate sequence applies all-target filters to Leader activation", () => {
  const { state } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "activate",
          target: {
            type: "all",
            player: "self",
            zone: "leaderArea",
            filter: { categories: ["leader"], typesAny: ["Fish-Man"] },
          },
        },
      },
    ],
  });
  const p1State = must(state.players[p1], "p1");
  p1State.leader = { ...p1State.leader, state: "rested" };
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    types: ["Fish-Man"],
  };

  const resolved = processEffectRuntime(state);

  assert.equal(resolved.errors, undefined);
  assert.equal(
    must(resolved.state.players[p1], "resolved p1").leader.state,
    "active",
  );
});

test("activate sequence leaves nonmatching all-target Leaders rested", () => {
  const { state } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "activate",
          target: {
            type: "all",
            player: "self",
            zone: "leaderArea",
            filter: { categories: ["leader"], typesAny: ["Fish-Man"] },
          },
        },
      },
    ],
  });
  const p1State = must(state.players[p1], "p1");
  p1State.leader = { ...p1State.leader, state: "rested" };
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    types: ["Straw Hat Crew"],
  };

  const resolved = processEffectRuntime(state);

  assert.equal(resolved.errors, undefined);
  assert.equal(
    must(resolved.state.players[p1], "resolved p1").leader.state,
    "rested",
  );
});

test("activate sequence can set all rested DON active directly", () => {
  const { state } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "activate",
          target: {
            type: "all",
            player: "self",
            zone: "costArea",
            filter: { categories: ["don"], state: "rested" },
          },
        },
      },
    ],
  });
  const p1State = must(state.players[p1], "p1");
  const donTemplate = must(p1State.donDeck[0], "don template");
  const costArea = Array.from({ length: 3 }, (_, index) => ({
    ...donTemplate,
    instanceId: toInstanceId(`all-don-activation:${String(index)}`),
    zone: {
      zone: "costArea" as const,
      playerId: p1,
      slot: "cost" as const,
      index,
    },
    state: index === 2 ? ("active" as const) : ("rested" as const),
  }));
  p1State.donDeck = [];
  p1State.costArea = costArea;
  state.cardManifest.cards[donTemplate.cardId] = resolvedCard({
    cardId: donTemplate.cardId,
    category: "don",
  });

  const resolved = processEffectRuntime(state);

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(
    must(resolved.state.players[p1], "resolved p1").costArea.map(
      (card) => card.state,
    ),
    ["active", "active", "active"],
  );
});
