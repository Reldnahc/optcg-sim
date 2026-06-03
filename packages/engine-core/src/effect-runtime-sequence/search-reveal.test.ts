import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EngineResult,
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
} from "../effect-runtime-queue/test-support.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";

const searchThenDrawSequence = (
  lookCount: number,
): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "search-top-cards",
      connector: "always",
      effect: {
        type: "search",
        request: {
          zone: "deck",
          player: "self",
          lookCount,
          filter: {},
          min: 0,
          max: 1,
          destination: "hand",
          revealTo: "chooserOnly",
          remainingCards: {
            destination: "deck",
            position: "bottom",
            order: "ownerChoice",
          },
          shuffleAfter: false,
        },
      },
    },
    {
      id: "draw-after-search",
      connector: "then",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const revealTopPlayRestedSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => {
  const revealSet = "set:revealed-top" as SelectionSetId;
  const selection = "revealSelection:play" as SelectionId;
  return {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "revealTop",
          player: "self",
          count: 1,
          saveAs: revealSet,
          visibility: "bothPlayers",
        },
      },
      {
        connector: "then",
        effect: {
          type: "selectFromSet",
          set: revealSet,
          chooser: "self",
          min: 0,
          max: 1,
          filter: {
            categories: ["character"],
            typesAny: ["The Seven Warlords of the Sea"],
            cost: { max: 4 },
          },
          saveAs: selection,
        },
      },
      {
        connector: "ifPreviousSucceeded",
        effect: {
          type: "playSelected",
          selection,
          enterRested: true,
          ignoreCost: true,
        },
      },
    ],
  };
};

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-search-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "search-sequence-rules",
      sourceTextHash: "search-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-search-sequence"),
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
  minimumDeckCount: number,
): { state: GameState; definition: EffectDefinition } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  player.hand = reindexHand(player.hand.slice(1));
  while (player.deck.length < minimumDeckCount) {
    const refill = must(player.hand.at(-1), "deck refill");
    player.hand = reindexHand(player.hand.slice(0, -1));
    player.deck = [
      ...player.deck,
      {
        ...refill,
        zone: {
          zone: "deck",
          playerId: p1,
          slot: "deck",
          index: player.deck.length,
        },
      },
    ];
  }
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-search-sequence"),
      timingWindowId: toTimingWindowId("window-search-sequence"),
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
      causedBy: { type: "ruleProcess", name: "search-sequence-test" },
    },
  ];
  return { state, definition };
};

const respondWithCards = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  const selected = must(decision.candidates[0], "search candidate").card;
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });
};

const respondWithNoCards = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [] },
  });
};

const respondWithOrderedIds = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  assert.equal(decision.type, "orderCards");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "orderedIds",
      ids: decision.cards.map((card) => String(card.instanceId)),
    },
  });
};

const markTopDeckAsSearchCandidates = (
  state: GameState,
  count: number,
): readonly CardInstance[] => {
  const player = must(state.players[p1], "p1");
  const cards = player.deck.slice(0, count);
  assert.equal(cards.length, count);
  for (const card of cards) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "event",
    });
  }
  return cards;
};

test("sequence search segment resumes into following then segment", () => {
  const { state } = sequenceQueueState(searchThenDrawSequence(1), 2);
  const [searchCard, drawnCard] = markTopDeckAsSearchCandidates(state, 2);

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.pendingDecision?.type, "selectCards");
  assert.equal(paused.state.effectExecutionFrames.length, 1);

  const resolved = respondWithCards(paused.state);
  const player = must(resolved.state.players[p1], "resolved p1");

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectExecutionFrames.length, 0);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.ok(
    player.hand.some((card) => card.instanceId === searchCard?.instanceId),
  );
  assert.ok(
    player.hand.some((card) => card.instanceId === drawnCard?.instanceId),
  );
});

test("sequence reveal-top segment can select and play the revealed card rested", () => {
  const effect = revealTopPlayRestedSequence();
  const { state } = sequenceQueueState(effect, 1);
  const topCard = must(state.players[p1], "p1").deck[0];
  assert.ok(topCard !== undefined);
  state.cardManifest.cards[topCard.cardId] = {
    ...resolvedCard({
      cardId: topCard.cardId,
      category: "character",
      cost: 4,
      power: 5000,
    }),
    types: ["The Seven Warlords of the Sea"],
  };

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.pendingDecision?.type, "selectCards");
  assert.equal(paused.state.pendingDecision.candidates.length, 1);

  const resolved = respondWithCards(paused.state);
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const player = must(resolved.state.players[p1], "resolved p1");
  const played = player.characters.find(
    (card) => card.instanceId === topCard.instanceId,
  );
  assert.ok(played !== undefined);
  assert.equal(played.state, "rested");
  assert.ok(
    !player.deck.some((card) => card.instanceId === topCard.instanceId),
  );
});

test("sequence reveal-top select-from-set projects unplayable revealed cards as disabled choices", () => {
  const { state } = sequenceQueueState(revealTopPlayRestedSequence(), 1);
  const topCard = must(must(state.players[p1], "p1").deck[0], "top card");
  state.cardManifest.cards[topCard.cardId] = resolvedCard({
    cardId: topCard.cardId,
    category: "event",
    cost: 4,
  });

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.pendingDecision?.type, "selectCards");
  assert.equal(paused.state.pendingDecision.candidates.length, 0);

  const view = filterStateForPlayer(paused.state, p1);
  assert.deepEqual(
    view.pendingDecision?.type === "selectCards"
      ? view.pendingDecision.choices
      : undefined,
    [
      {
        card: {
          instanceId: topCard.instanceId,
          cardId: topCard.cardId,
          playerId: p1,
          zone: topCard.zone,
        },
        selectable: false,
      },
    ],
  );
});

test("sequence reveal-top select-from-set allows declining when the revealed card is unplayable", () => {
  const { state } = sequenceQueueState(revealTopPlayRestedSequence(), 1);
  const topCard = must(must(state.players[p1], "p1").deck[0], "top card");
  state.cardManifest.cards[topCard.cardId] = resolvedCard({
    cardId: topCard.cardId,
    category: "event",
    cost: 4,
  });

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.pendingDecision?.type, "selectCards");

  const resolved = respondWithNoCards(paused.state);
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectExecutionFrames.length, 0);
  assert.equal(resolved.state.effectQueue.length, 0);
  const player = must(resolved.state.players[p1], "resolved p1");
  assert.ok(player.deck.some((card) => card.instanceId === topCard.instanceId));
  assert.ok(
    !player.characters.some((card) => card.instanceId === topCard.instanceId),
  );
});

test("sequence search segment resumes after bottom-ordering remaining looked cards", () => {
  const { state } = sequenceQueueState(searchThenDrawSequence(3), 3);
  markTopDeckAsSearchCandidates(state, 3);

  const paused = processEffectRuntime(state);
  const orderPending = respondWithCards(paused.state);
  assert.equal(orderPending.errors, undefined);
  assert.equal(orderPending.state.pendingDecision?.type, "orderCards");
  assert.equal(orderPending.state.effectExecutionFrames.length, 1);

  const resolved = respondWithOrderedIds(orderPending.state);

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectExecutionFrames.length, 0);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(resolved.events.at(-1)?.type, "effectResolved");
});
