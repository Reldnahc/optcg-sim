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
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toInstanceId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";

const reindexDeck = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId: p1, slot: "deck", index },
  }));

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-shuffle-deck";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "shuffle-deck-rules",
      sourceTextHash: "shuffle-deck-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-shuffle-deck"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const sequenceQueueState = (effect: Effect): GameState => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-shuffle-deck"),
      timingWindowId: toTimingWindowId("window-shuffle-deck"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "shuffle-deck-test" },
    },
  ];
  return state;
};

test("shuffleDeck sequence segment deterministically shuffles and emits a public event", () => {
  const state = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: { type: "shuffleDeck", player: "self" },
      },
    ],
  });
  const player = must(state.players[p1], "p1");
  const baseDeckCard = must(player.deck[0], "base deck card");
  player.deck = reindexDeck(
    Array.from({ length: 6 }, (_, index) => ({
      ...baseDeckCard,
      instanceId: toInstanceId(`shuffle-deck-card-${String(index)}`),
    })),
  );
  const beforeIds = player.deck.map((card) => card.instanceId);
  const beforeRngCallCount = state.rng.callCount;

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  const after = must(result.state.players[p1], "p1 after").deck;
  assert.deepEqual(
    [...after.map((card) => card.instanceId)].sort(),
    [...beforeIds].sort(),
  );
  assert.notDeepEqual(
    after.map((card) => card.instanceId),
    beforeIds,
  );
  assert.deepEqual(
    after.map((card) => card.zone.index),
    [0, 1, 2, 3, 4, 5],
  );
  assert.equal(result.state.rng.callCount, beforeRngCallCount + 5);
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "deckShuffled" &&
        event.visibility.type === "public" &&
        (event.payload as { playerId?: unknown }).playerId === p1,
    ),
    true,
  );
});
