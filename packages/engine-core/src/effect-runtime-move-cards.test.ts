import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import { applyAction } from "./actions.js";
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

const handRef = (card: CardInstance, playerId = p1): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

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

const addActiveDonFromDonDeckEffect = (): Effect => ({
  type: "moveCards",
  min: 0,
  count: 1,
  from: { player: "self", zone: "donDeck", position: "top" },
  to: { player: "self", zone: "costArea" },
  order: "original",
  destinationState: "active",
});

const lifeTopToHandEffect = (count: number): Effect => ({
  type: "moveCards",
  count,
  from: { player: "self", zone: "life", position: "top" },
  to: { player: "self", zone: "hand" },
  order: "original",
});

const lifeBottomToHandEffect = (count: number): Effect => ({
  type: "moveCards",
  count,
  from: { player: "self", zone: "life", position: "bottom" },
  to: { player: "self", zone: "hand" },
  order: "original",
});

const lifeTopToTrashEffect = (count: number): Effect => ({
  type: "moveCards",
  count,
  from: { player: "self", zone: "life", position: "top" },
  to: { player: "self", zone: "trash" },
  order: "original",
});

const deckTopToLifeTopEffect = (count: number): Effect => ({
  type: "moveCards",
  min: 0,
  count,
  from: { player: "self", zone: "deck", position: "top" },
  to: { player: "self", zone: "life", position: "top" },
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

const setupMoveCardsDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-move-cards";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "event",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "move-cards-rules",
      sourceTextHash: "move-cards-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-move-cards"),
        category: "auto",
        effect,
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
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

const triggerDonMoveQueueState = (): {
  state: GameState;
  movedDon: CardInstance;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "source");
  const movedDon = must(p1State.donDeck[0], "top DON");
  const definition = setupMoveCardsDefinition(
    state,
    source,
    addActiveDonFromDonDeckEffect(),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-trigger-don-move"),
      timingWindowId: toTimingWindowId("window-trigger-don-move"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "DON move effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "trigger-don-move-test" },
    },
  ];
  return { state, movedDon };
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

test("moveCards DON deck to cost area resolves from a trigger body", () => {
  const { state, movedDon } = triggerDonMoveQueueState();
  const originalDonDeckSize = must(state.players[p1], "p1").donDeck.length;

  const result = processEffectRuntime(state);
  const player = must(result.state.players[p1], "p1 result");
  const moved = must(player.costArea.at(-1), "moved DON");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(player.donDeck.length, originalDonDeckSize - 1);
  assert.equal(moved.instanceId, movedDon.instanceId);
  assert.equal(moved.state, "active");
  assert.equal(moved.zone.zone, "costArea");
  assert.equal(moved.zone.slot, "cost");
});

test("moveCards top life to hand resolves without revealing hidden card identity publicly", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "source");
  const topLife = must(p1State.life[0], "top life").card;
  const secondLife = must(p1State.life[1], "second life").card;
  const originalHandLength = p1State.hand.length;
  const definition = setupMoveCardsDefinition(
    state,
    source,
    lifeTopToHandEffect(1),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-life-to-hand"),
      timingWindowId: toTimingWindowId("window-life-to-hand"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "life move effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "life-to-hand-test" },
    },
  ];

  const result = processEffectRuntime(state);
  const player = must(result.state.players[p1], "p1 result");

  assert.equal(result.errors, undefined);
  assert.equal(player.life.length, p1State.life.length - 1);
  assert.equal(
    must(player.hand.at(-1), "new hand card").instanceId,
    topLife.instanceId,
  );
  assert.equal(
    must(player.life[0], "remaining top life").card.instanceId,
    secondLife.instanceId,
  );
  assert.deepEqual(
    result.events.map((event) => [event.type, event.visibility]),
    [
      ["cardMoved", { type: "public" }],
      ["cardMoved", { type: "private", playerId: p1 }],
      ["effectResolved", { type: "public" }],
      ["ruleProcessingChecked", { type: "replayOnly" }],
    ],
  );
  assert.deepEqual(result.events[0]?.payload, {
    from: { zone: "life", playerId: p1, slot: "life", index: 0 },
    to: { zone: "hand", playerId: p1, slot: "hand", index: originalHandLength },
    reason: "moveCards",
  });
  assert.deepEqual(result.events[1]?.payload, {
    instanceId: topLife.instanceId,
    cardId: topLife.cardId,
    from: { zone: "life", playerId: p1, slot: "life", index: 0 },
    to: { zone: "hand", playerId: p1, slot: "hand", index: originalHandLength },
    reason: "moveCards",
  });
});

test("moveCards bottom life to hand moves the bottom Life card without public identity", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "source");
  const bottomLife = must(p1State.life.at(-1), "bottom life").card;
  const definition = setupMoveCardsDefinition(
    state,
    source,
    lifeBottomToHandEffect(1),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-life-bottom-to-hand"),
      timingWindowId: toTimingWindowId("window-life-bottom-to-hand"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "life move effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "life-bottom-to-hand-test" },
    },
  ];

  const result = processEffectRuntime(state);
  const player = must(result.state.players[p1], "p1 result");

  assert.equal(result.errors, undefined);
  assert.equal(player.life.length, p1State.life.length - 1);
  assert.equal(
    must(player.hand.at(-1), "new hand card").instanceId,
    bottomLife.instanceId,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.visibility.type === "public" &&
        JSON.stringify(event.payload).includes(String(bottomLife.cardId)),
    ),
    false,
  );
});

test("moveCards top life to trash reveals the trashed card publicly", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "source");
  const topLife = must(p1State.life[0], "top life").card;
  const definition = setupMoveCardsDefinition(
    state,
    source,
    lifeTopToTrashEffect(1),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-life-to-trash"),
      timingWindowId: toTimingWindowId("window-life-to-trash"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "life trash effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "life-to-trash-test" },
    },
  ];

  const result = processEffectRuntime(state);
  const player = must(result.state.players[p1], "p1 result");

  assert.equal(result.errors, undefined);
  assert.equal(player.life.length, p1State.life.length - 1);
  assert.equal(
    must(player.trash[0], "trash top").instanceId,
    topLife.instanceId,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "cardTrashed" &&
        JSON.stringify(event.payload).includes(String(topLife.cardId)),
    ),
    true,
  );
});

test("moveCards deck top to life top keeps card identity hidden publicly", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "source");
  const topDeck = must(p1State.deck[0], "top deck");
  const originalLifeTop = must(p1State.life[0], "life top").card;
  const definition = setupMoveCardsDefinition(
    state,
    source,
    deckTopToLifeTopEffect(1),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-deck-to-life"),
      timingWindowId: toTimingWindowId("window-deck-to-life"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "deck to life effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "deck-to-life-test" },
    },
  ];

  const result = processEffectRuntime(state);
  const player = must(result.state.players[p1], "p1 result");

  assert.equal(result.errors, undefined);
  assert.equal(
    must(player.life[0], "new life top").card.instanceId,
    topDeck.instanceId,
  );
  assert.equal(
    must(player.life[1], "old life top").card.instanceId,
    originalLifeTop.instanceId,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.visibility.type === "public" &&
        JSON.stringify(event.payload).includes(String(topDeck.cardId)),
    ),
    false,
  );
});

test("optional moveCards deck top to life top resumes into following trashFromHand segment", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "source");
  const trashSelection = must(p1State.hand[1], "trash selection");
  const topDeck = must(p1State.deck[0], "top deck");
  const originalLifeTop = must(p1State.life[0], "life top").card;
  const definition = setupMoveCardsDefinition(state, source, {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: lifeTopToTrashEffect(1),
      },
      {
        connector: "then",
        effect: deckTopToLifeTopEffect(1),
      },
      {
        connector: "then",
        effect: {
          type: "trashFromHand",
          player: "self",
          chooser: "self",
          count: 1,
        },
      },
    ],
  });
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-deck-life-trash-hand"),
      timingWindowId: toTimingWindowId("window-deck-life-trash-hand"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "deck-life-trash-hand-test" },
    },
  ];

  const paused = processEffectRuntime(state);
  const quantityDecision = must(
    paused.state.pendingDecision,
    "quantity decision",
  );
  const afterFirstSegment = must(paused.state.players[p1], "after first");

  assert.equal(paused.errors, undefined);
  assert.equal(quantityDecision.type, "chooseQuantity");
  assert.equal(
    must(afterFirstSegment.trash[0], "trashed life").instanceId,
    originalLifeTop.instanceId,
  );

  const quantityResolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });
  const trashDecision = must(
    quantityResolved.state.pendingDecision,
    "trash decision",
  );
  const afterMove = must(quantityResolved.state.players[p1], "after move");

  assert.equal(quantityResolved.errors, undefined);
  assert.equal(trashDecision.type, "selectCards");
  assert.equal(
    must(afterMove.life[0], "new life top").card.instanceId,
    topDeck.instanceId,
  );

  const completed = applyAction(quantityResolved.state, {
    type: "respondToDecision",
    decisionId: trashDecision.id,
    response: { type: "cards", cards: [handRef(trashSelection)] },
  });
  const completedPlayer = must(completed.state.players[p1], "completed p1");

  assert.equal(completed.errors, undefined);
  assert.equal(completed.state.pendingDecision, undefined);
  assert.equal(completed.state.effectQueue.length, 0);
  assert.equal(
    must(completedPlayer.trash[0], "trashed hand").instanceId,
    trashSelection.instanceId,
  );
});

test("nested conditional up-to moveCards quantity resumes from the nested path", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "source");
  const topLife = must(p1State.life[0], "top life").card;
  const topDeck = must(p1State.deck[0], "top deck");
  const definition = setupMoveCardsDefinition(state, source, {
    type: "sequence",
    effects: [
      {
        id: "cost:life-to-hand",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: {
            type: "moveCards",
            count: 1,
            chooser: "self",
            from: { player: "self", zone: "life", position: "top" },
            to: { player: "self", zone: "hand" },
            order: "chooserChoice",
            optional: true,
          },
        },
      },
      {
        id: "conditional:add-life",
        connector: "ifYouDo",
        effect: {
          type: "conditional",
          if: { type: "yourTurn" },
          then: deckTopToLifeTopEffect(1),
        },
      },
    ],
  });
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-nested-life-play"),
      timingWindowId: toTimingWindowId("window-nested-life-play"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "nested-life-play-test" },
    },
  ];

  const costPaused = processEffectRuntime(state);
  assert.equal(costPaused.errors, undefined);
  const costDecision = must(costPaused.state.pendingDecision, "cost decision");
  assert.equal(costDecision.type, "payCost");

  const costPaid = applyAction(costPaused.state, {
    type: "respondToDecision",
    decisionId: costDecision.id,
    response: {
      type: "payment",
      optionId: "moveCards:top",
      selectedCardInstanceIds: [topLife.instanceId],
    },
  });
  const quantityDecision = must(
    costPaid.state.pendingDecision,
    "quantity decision",
  );
  assert.equal(costPaid.errors, undefined);
  assert.equal(quantityDecision.type, "chooseQuantity");

  const quantityChosen = applyAction(costPaid.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });
  const afterQuantity = must(
    quantityChosen.state.players[p1],
    "after quantity",
  );

  assert.equal(quantityChosen.errors, undefined);
  assert.equal(quantityChosen.state.pendingDecision, undefined);
  assert.equal(quantityChosen.state.effectQueue.length, 0);
  assert.equal(
    must(afterQuantity.life[0], "new top life").card.instanceId,
    topDeck.instanceId,
  );
});
