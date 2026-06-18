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
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";

const setupQueueState = (effect: Effect): GameState => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  setupDefinition(state, source, effect);
  return state;
};

const setupDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): void => {
  const effectDefinitionId = "def-all-target-rest";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "all-target-rest-rules",
      sourceTextHash: "all-target-rest-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-all-target-rest"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-all-target-rest"),
      timingWindowId: toTimingWindowId("window-all-target-rest"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "rest effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "all-target-rest-test" },
    },
  ];
};

test("all-target rest rests every matching opponent Character through field mutation runtime", () => {
  const state = setupQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "rest",
          target: {
            type: "all",
            zone: "characterArea",
            player: "opponent",
            filter: { categories: ["character"] },
          },
        },
      },
    ],
  });
  const p2State = must(state.players[p2], "p2");
  const first = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "first opponent character"),
    zone: "characterArea",
    index: 0,
  });
  const second = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[1], "second opponent character"),
    zone: "characterArea",
    index: 1,
  });
  for (const card of [first, second]) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      power: 5000,
    });
  }

  const result = processEffectRuntime(state);
  const nextP2 = must(result.state.players[p2], "p2 result");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    must(
      nextP2.characters.find((card) => card.instanceId === first.instanceId),
      "first result",
    ).state,
    "rested",
  );
  assert.equal(
    must(
      nextP2.characters.find((card) => card.instanceId === second.instanceId),
      "second result",
    ).state,
    "rested",
  );
  assert.equal(
    result.events.filter((event) => event.type === "cardRested").length,
    2,
  );
});
