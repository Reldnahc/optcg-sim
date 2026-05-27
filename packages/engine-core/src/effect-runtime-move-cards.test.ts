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
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";

const reindexCards = (
  cards: readonly CardInstance[],
  zone: "deck" | "hand" | "trash",
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone, playerId: p1, slot: zone, index },
  }));

const deckTopTrashEffect = (count: number): Effect => ({
  type: "moveCards",
  count,
  from: { player: "self", zone: "deck", position: "top" },
  to: { player: "self", zone: "trash" },
  order: "original",
});

const setupDeckTopTrashDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-deck-top-trash";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "deck-top-trash-rules",
      sourceTextHash: "deck-top-trash-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-deck-top-trash"),
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

const deckTopTrashQueueState = (
  effect: Effect = deckTopTrashEffect(1),
): { state: GameState; source: CardInstance; topCards: CardInstance[] } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const topCards = reindexCards(p1State.hand.slice(1, 4), "deck");
  p1State.deck = topCards;
  p1State.hand = reindexCards(p1State.hand.slice(4), "hand");
  p1State.trash = [];
  const definition = setupDeckTopTrashDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-deck-top-trash"),
      timingWindowId: toTimingWindowId("window-deck-top-trash"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "deck-top-trash effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "deck-top-trash-test" },
    },
  ];
  return { state, source, topCards };
};

test("moveCards deck top to trash resolves without a decision and preserves top-card order", () => {
  const { state, topCards } = deckTopTrashQueueState(deckTopTrashEffect(2));

  const result = processEffectRuntime(state);
  const player = must(result.state.players[p1], "p1 result");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.deepEqual(
    player.trash.map((card) => card.instanceId),
    topCards.slice(0, 2).map((card) => card.instanceId),
  );
  assert.deepEqual(
    player.deck.map((card) => card.instanceId),
    topCards.slice(2).map((card) => card.instanceId),
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "cardMoved",
      "cardTrashed",
      "cardMoved",
      "cardTrashed",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
});

test("moveCards deck top to trash places moved cards on top of existing trash", () => {
  const { state, topCards } = deckTopTrashQueueState(deckTopTrashEffect(2));
  const player = must(state.players[p1], "p1");
  const existingTrash = reindexCards(player.hand.slice(0, 1), "trash");
  player.hand = reindexCards(player.hand.slice(1), "hand");
  player.trash = existingTrash;

  const result = processEffectRuntime(state);
  const nextPlayer = must(result.state.players[p1], "p1 result");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    nextPlayer.trash.map((card) => card.instanceId),
    [
      ...topCards.slice(0, 2).map((card) => card.instanceId),
      must(existingTrash[0], "existing trash").instanceId,
    ],
  );
  nextPlayer.trash.forEach((card, index) => {
    assert.equal(card.zone.zone, "trash");
    assert.equal(card.zone.slot, "trash");
    assert.equal(card.zone.index, index);
  });
});

test("moveCards deck top to trash fails closed for unsupported zone movement", () => {
  const { state } = deckTopTrashQueueState({
    type: "moveCards",
    count: 1,
    from: { player: "self", zone: "hand", position: "top" },
    to: { player: "self", zone: "trash" },
    order: "original",
  });

  const result = processEffectRuntime(state);

  assert.notEqual(result.errors, undefined);
  assert.equal(must(result.state.players[p1], "p1 result").trash.length, 0);
});
