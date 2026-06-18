import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
  SelectionId,
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
} from "../effect-runtime-queue/test-support.js";

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
  const effectDefinitionId = "def-deck-top-trash-saved-card";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "deck-top-trash-saved-card-rules",
      sourceTextHash: "deck-top-trash-saved-card-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-deck-top-trash-saved-card"),
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
  effect: Effect,
): { state: GameState; topCards: CardInstance[] } => {
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
      id: toQueueEntryId("queue-entry-deck-top-trash-saved-card"),
      timingWindowId: toTimingWindowId("window-deck-top-trash-saved-card"),
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
      causedBy: {
        type: "ruleProcess",
        name: "deck-top-trash-saved-card-test",
      },
    },
  ];
  return { state, topCards };
};

const deckTopTrashThenConditionalDraw = (selection: SelectionId): Effect => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      saveResultAs: selection,
      saveResultKinds: ["selectedCards:deck"],
      effect: deckTopTrashEffect(1),
    },
    {
      connector: "ifPreviousSucceeded",
      effect: {
        type: "conditional",
        if: {
          type: "cardMatches",
          target: {
            type: "savedSelectedCard",
            selection,
            onFailure: "failClosed",
          },
          filter: { cost: { op: "gte", value: 6 } },
        },
        then: { type: "draw", player: "self", count: 1 },
      },
    },
  ],
});

test("sequence moveCards can save public moved deck cards for later cardMatches conditions", () => {
  const selection = "selected:trashed-top-deck" as SelectionId;
  const { state, topCards } = deckTopTrashQueueState(
    deckTopTrashThenConditionalDraw(selection),
  );
  const topCard = must(topCards[0], "top card");
  state.cardManifest.cards[topCard.cardId] = resolvedCard({
    cardId: topCard.cardId,
    category: "character",
    cost: 6,
  });
  const handCount = must(state.players[p1], "p1").hand.length;

  const result = processEffectRuntime(state);
  const player = must(result.state.players[p1], "p1 result");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(player.hand.length, handCount + 1);
});

test("sequence cardMatches on saved moved cards skips the branch when filter fails", () => {
  const selection = "selected:trashed-top-deck" as SelectionId;
  const { state, topCards } = deckTopTrashQueueState(
    deckTopTrashThenConditionalDraw(selection),
  );
  const topCard = must(topCards[0], "top card");
  state.cardManifest.cards[topCard.cardId] = resolvedCard({
    cardId: topCard.cardId,
    category: "character",
    cost: 5,
  });
  const handCount = must(state.players[p1], "p1").hand.length;

  const result = processEffectRuntime(state);
  const player = must(result.state.players[p1], "p1 result");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(player.hand.length, handCount);
});
