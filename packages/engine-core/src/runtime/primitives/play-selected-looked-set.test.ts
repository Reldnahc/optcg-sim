import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
  SelectionId,
  SelectionSetId,
} from "@optcg/types";

import {
  applyAction,
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
} from "../../effect-runtime-queue/test-support.js";

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const lookedSetPlaySequence = (): Extract<Effect, { type: "sequence" }> => {
  const lookedSet = "set:looked-play-candidates" as SelectionSetId;
  const selected = "revealSelection:play-from-looked-set" as SelectionId;
  return {
    type: "sequence",
    effects: [
      {
        id: "reveal-top-play-candidates",
        connector: "always",
        effect: {
          type: "revealTop",
          player: "self",
          zone: "deck",
          count: 5,
          saveAs: lookedSet,
          visibility: "chooserOnly",
        },
      },
      {
        id: "select-play-candidates",
        connector: "then",
        effect: {
          type: "selectFromSet",
          set: lookedSet,
          chooser: "self",
          min: 0,
          max: 2,
          filter: {
            categories: ["character"],
            typesAny: ["Impel Down"],
            power: { max: 6000 },
          },
          saveAs: selected,
        },
      },
      {
        id: "play-looked-candidates",
        connector: "ifPreviousSucceeded",
        effect: {
          type: "playSelected",
          selection: selected,
          ignoreCost: true,
        },
      },
      {
        id: "bottom-rest",
        connector: "then",
        effect: {
          type: "placeSetRemainder",
          set: lookedSet,
          owner: "self",
          destination: "deck",
          position: "bottom",
          order: "chooser",
        },
      },
    ],
  };
};

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-looked-set-play-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "looked-set-play-rules",
      sourceTextHash: "looked-set-play-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-looked-set-play-sequence"),
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
  const remainingHand = p1State.hand.slice(1);
  const refill = must(remainingHand.at(-1), "refill");
  p1State.hand = reindexHand(remainingHand.slice(0, -1));
  p1State.deck = [
    ...p1State.deck,
    {
      ...refill,
      zone: {
        zone: "deck",
        playerId: p1,
        slot: "deck",
        index: p1State.deck.length,
      },
    },
  ];
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-looked-set-play"),
      timingWindowId: toTimingWindowId("window-looked-set-play"),
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
      causedBy: { type: "ruleProcess", name: "looked-set-play-test" },
    },
  ];
  return state;
};

const markTopDeckCharactersSupported = (
  state: GameState,
  count: number,
): CardInstance[] => {
  const player = must(state.players[p1], "p1");
  while (player.deck.length < count) {
    const base = must(player.deck.at(-1), "deck base");
    player.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:looked-set:${String(player.deck.length)}` as CardInstance["instanceId"],
      zone: { ...base.zone, index: player.deck.length },
    });
  }
  const topDeck = player.deck.slice(0, count);
  for (const card of topDeck) {
    state.cardManifest.cards[card.cardId] = {
      ...resolvedCard({
        cardId: card.cardId,
        category: "character",
        cost: 1,
        power: 5000,
      }),
      types: ["Impel Down"],
    };
  }
  return topDeck;
};

test("looked-set playSelected plays selected deck cards and bottoms only the remainder", () => {
  const state = sequenceQueueState(lookedSetPlaySequence());
  const topDeck = markTopDeckCharactersSupported(state, 5);
  const selected = topDeck.slice(0, 2);
  const expectedRemainder = topDeck.slice(2, 5);

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const selection = must(paused.state.pendingDecision, "selection");
  assert.equal(selection.type, "selectCards");
  assert.deepEqual(
    selection.candidates.map((candidate) => candidate.card.instanceId),
    topDeck.map((card) => card.instanceId),
  );

  const played = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: selection.id,
    response: {
      type: "cards",
      cards: selected.map((card) => ({
        instanceId: card.instanceId,
        cardId: card.cardId,
        playerId: p1,
        zone: card.zone,
      })),
    },
  });
  assert.equal(played.errors, undefined);
  const order = must(played.state.pendingDecision, "remainder order");
  assert.equal(order.type, "orderCards");
  assert.deepEqual(
    order.cards.map((card) => card.instanceId),
    expectedRemainder.map((card) => card.instanceId),
  );
  assert.deepEqual(
    must(played.state.players[p1], "p1")
      .characters.slice(-2)
      .map((card) => card.instanceId),
    selected.map((card) => card.instanceId),
  );

  const ordered = applyAction(played.state, {
    type: "respondToDecision",
    decisionId: order.id,
    response: {
      type: "orderedIds",
      ids: order.cards.map((card) => String(card.instanceId)).reverse(),
    },
  });
  assert.equal(ordered.errors, undefined);
  assert.equal(ordered.state.pendingDecision, undefined);
  assert.deepEqual(ordered.state.effectQueue, []);
  const finalPlayer = must(ordered.state.players[p1], "p1 final");
  assert.equal(
    finalPlayer.deck.some((card) =>
      selected.some(
        (selectedCard) => selectedCard.instanceId === card.instanceId,
      ),
    ),
    false,
  );
  assert.deepEqual(
    finalPlayer.deck.slice(-3).map((card) => card.instanceId),
    expectedRemainder.map((card) => card.instanceId).reverse(),
  );
});
