import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  GameState,
  HandSelectionId,
} from "@optcg/types";

import { applyAction } from "../actions.js";
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
} from "../effect-runtime-queue/test-support.js";

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

const lifeTopToTrashEffect = (
  count: number,
  player: "self" | "opponent" = "self",
  min?: number,
): Effect => ({
  type: "moveCards",
  ...(min === undefined ? {} : { min }),
  count,
  from: { player, zone: "life", position: "top" },
  to: { player, zone: "trash" },
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

test.each([
  { player: "self" as const, playerId: p1 },
  { player: "opponent" as const, playerId: p2 },
])(
  "moveCards top $player life to trash reveals the trashed card publicly",
  ({ player, playerId }) => {
    const state = createActiveState();
    const p1State = must(state.players[p1], "p1");
    const movedPlayer = must(state.players[playerId], "moved player");
    const source = must(p1State.hand[0], "source");
    const topLife = must(movedPlayer.life[0], "top life").card;
    const definition = setupMoveCardsDefinition(
      state,
      source,
      lifeTopToTrashEffect(1, player),
    );
    state.effectQueue = [
      {
        ...queueDrawForP1(),
        id: toQueueEntryId(`queue-entry-${player}-life-to-trash`),
        timingWindowId: toTimingWindowId(`window-${player}-life-to-trash`),
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
    const resultPlayer = must(result.state.players[playerId], "result player");

    assert.equal(result.errors, undefined);
    assert.equal(resultPlayer.life.length, movedPlayer.life.length - 1);
    assert.equal(
      must(resultPlayer.trash[0], "trash top").instanceId,
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
  },
);

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

  const quantityPrompt = processEffectRuntime(state);
  const decision = must(
    quantityPrompt.state.pendingDecision,
    "deck-to-life quantity decision",
  );
  assert.equal(quantityPrompt.errors, undefined);
  assert.equal(decision.type, "chooseQuantity");

  const result = applyAction(quantityPrompt.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });
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

test("conditional queued up-to deck top to life top asks quantity and can choose zero", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "source");
  const originalDeck = reindexCards(
    [...p1State.deck, ...p1State.hand.slice(1, 3)],
    "deck",
  );
  const originalLife = p1State.life.slice(0, 2).map((life, index) => ({
    ...life,
    card: {
      ...life.card,
      zone: {
        zone: "life" as const,
        playerId: p1,
        slot: "life" as const,
        index,
      },
    },
  }));
  p1State.deck = originalDeck;
  p1State.life = originalLife;
  p1State.hand = reindexCards([source, ...p1State.hand.slice(3)], "hand");
  const definition = setupMoveCardsDefinition(
    state,
    must(p1State.hand[0], "reindexed source"),
    deckTopToLifeTopEffect(1),
  );
  const effectBlock = must(definition.effects[0], "move effect");
  effectBlock.condition = {
    type: "lifeCount",
    player: "self",
    op: "lte",
    value: 2,
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-conditional-deck-to-life"),
      timingWindowId: toTimingWindowId("window-conditional-deck-to-life"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: effectBlock.id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "conditional-deck-life-test" },
    },
  ];

  const quantityPrompt = processEffectRuntime(state);
  const decision = must(
    quantityPrompt.state.pendingDecision,
    "quantity decision",
  );

  assert.equal(quantityPrompt.errors, undefined);
  assert.equal(decision.type, "chooseQuantity");
  assert.equal(
    decision.prompt,
    "Choose how many cards to move from deck to Life.",
  );
  assert.equal(decision.min, 0);
  assert.equal(decision.max, 1);

  const declined = applyAction(quantityPrompt.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 0 },
  });
  const declinedP1 = must(declined.state.players[p1], "declined p1");

  assert.equal(declined.errors, undefined);
  assert.equal(declined.state.pendingDecision, undefined);
  assert.equal(declined.state.effectQueue.length, 0);
  assert.equal(declined.state.status.type, "active");
  assert.deepEqual(
    declinedP1.deck.map((card) => card.instanceId),
    originalDeck.map((card) => card.instanceId),
  );
  assert.deepEqual(
    declinedP1.life.map((life) => life.card.instanceId),
    originalLife.map((life) => life.card.instanceId),
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

test("optional life cost resumes conditional deck-to-life and then hand playSelected", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "source");
  const playCandidate = must(p1State.hand[1], "play candidate");
  const topLife = must(p1State.life[0], "top life").card;
  const topDeck = must(p1State.deck[0], "top deck");
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    types: ["Straw Hat Crew"],
  };
  state.cardManifest.cards[playCandidate.cardId] = {
    ...resolvedCard({
      cardId: playCandidate.cardId,
      category: "character",
      cost: 5,
    }),
    types: ["Sky Island"],
  };
  const handSelection = "handSelection:play-from-hand" as HandSelectionId;
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
        id: "body:after-cost",
        connector: "ifYouDo",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "conditional",
                if: {
                  type: "hasCardInZone",
                  zone: "leaderArea",
                  player: "self",
                  filter: {
                    categories: ["leader"],
                    typesAny: ["Straw Hat Crew"],
                  },
                },
                then: deckTopToLifeTopEffect(1),
              },
            },
            {
              connector: "then",
              effect: {
                type: "sequence",
                effects: [
                  {
                    id: "select:hand-play",
                    connector: "always",
                    saveResultAs: handSelection,
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        typesAny: ["Sky Island"],
                        cost: { max: 5 },
                      },
                      saveAs: handSelection,
                      visibility: "chooserOnly",
                    },
                  },
                  {
                    id: "play:selected-from-hand",
                    connector: "ifPossible",
                    effect: {
                      type: "playSelected",
                      selection: handSelection,
                      ignoreCost: true,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  });
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-life-cost-conditional-play"),
      timingWindowId: toTimingWindowId("window-life-cost-conditional-play"),
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
      causedBy: {
        type: "ruleProcess",
        name: "life-cost-conditional-play-test",
      },
    },
  ];

  const costPaused = processEffectRuntime(state);
  const costDecision = must(costPaused.state.pendingDecision, "cost decision");
  assert.equal(costPaused.errors, undefined);
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
  const selectDecision = must(
    quantityChosen.state.pendingDecision,
    "play selection decision",
  );
  const afterQuantity = must(
    quantityChosen.state.players[p1],
    "after quantity",
  );
  assert.equal(quantityChosen.errors, undefined);
  assert.equal(
    must(afterQuantity.life[0], "new top life").card.instanceId,
    topDeck.instanceId,
  );
  assert.equal(selectDecision.type, "selectCards");

  const selected = must(selectDecision.candidates[0], "play candidate").card;
  const played = applyAction(quantityChosen.state, {
    type: "respondToDecision",
    decisionId: selectDecision.id,
    response: { type: "cards", cards: [selected] },
  });
  const afterPlay = must(played.state.players[p1], "after play");

  assert.equal(played.errors, undefined);
  assert.equal(
    afterPlay.characters.some(
      (character) => character.instanceId === playCandidate.instanceId,
    ),
    true,
  );
});
