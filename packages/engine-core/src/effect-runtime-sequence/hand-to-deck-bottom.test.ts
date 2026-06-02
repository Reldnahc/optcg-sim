import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
  PlayerId,
  SelectionId,
} from "@optcg/types";

import {
  applyAction,
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
} from "../effect-runtime-queue/test-support.js";

const reindexHand = (
  cards: readonly CardInstance[],
  playerId: PlayerId,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId, slot: "hand", index },
  }));

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-hand-to-deck-bottom-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "hand-to-deck-bottom-rules",
      sourceTextHash: "hand-to-deck-bottom-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-hand-to-deck-bottom-sequence"),
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

const queueSequence = (effect: Effect): GameState => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  player.hand = reindexHand(player.hand.slice(1), p1);
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-hand-to-deck-bottom-sequence"),
      timingWindowId: toTimingWindowId("window-hand-to-deck-bottom-sequence"),
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
        name: "hand-to-deck-bottom-sequence-test",
      },
    },
  ];
  return state;
};

test("opponent hand selection moves chosen card to the bottom of opponent deck", () => {
  const selection = "handSelection:opponent-hand-to-deck-bottom" as SelectionId;
  const state = queueSequence({
    type: "sequence",
    effects: [
      {
        connector: "always",
        saveResultAs: selection,
        effect: {
          type: "selectCards",
          zone: "hand",
          player: "opponent",
          chooser: "opponent",
          min: 1,
          max: 1,
          saveAs: selection,
          visibility: "chooserOnly",
        },
      },
      {
        connector: "then",
        effect: {
          type: "moveSelected",
          selection,
          from: "hand",
          to: "deck",
          position: "bottom",
        },
      },
    ],
  });
  const opponent = must(state.players[p2], "p2");
  const selected = must(opponent.hand[1], "selected opponent hand card");
  const originalDeckIds = opponent.deck.map((card) => card.instanceId);

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pending decision");

  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, p2);
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    opponent.hand.map((card) => card.instanceId),
  );

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: selected.instanceId,
          cardId: selected.cardId,
          playerId: p2,
          zone: selected.zone,
        },
      ],
    },
  });
  const resolvedOpponent = must(resolved.state.players[p2], "resolved p2");

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.ok(
    !resolvedOpponent.hand.some(
      (card) => card.instanceId === selected.instanceId,
    ),
  );
  assert.deepEqual(
    resolvedOpponent.deck.map((card) => card.instanceId),
    [...originalDeckIds, selected.instanceId],
  );
});
